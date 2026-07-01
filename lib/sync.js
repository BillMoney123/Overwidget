const { AttachmentBuilder } = require('discord.js');
const sharp = require('sharp');
const fs    = require('fs');
const path  = require('path');

const BASE       = 'https://overfast-api.tekrop.fr';
const USERS_FILE = path.join(__dirname, '../users.json');
const CACHE_FILE = path.join(__dirname, '../hero-image-cache.json');

/* ── Change-detection cache (in-memory, reset on restart) ─── */
const lastPushed = new Map(); // userId → JSON fingerprint of last pushed stats

/* ── User storage ─────────────────────────────────────────── */
function getUsers() {
  if (!fs.existsSync(USERS_FILE)) return {};
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

/* ── Hero data cache ──────────────────────────────────────── */
let heroCache = null;
async function getHeroData() {
  if (heroCache) return heroCache;
  const res  = await fetch(`${BASE}/heroes?locale=en-us`);
  const list = await res.json();
  heroCache = Object.fromEntries(list.map(h => [h.key, { name: h.name, portrait: h.portrait }]));
  return heroCache;
}

/* ── Image processing + upload ────────────────────────────── */
const imageCache = fs.existsSync(CACHE_FILE)
  ? new Map(Object.entries(JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'))))
  : new Map();

function saveImageCache() {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(Object.fromEntries(imageCache)));
}

async function processHeroImage(heroKey, imageUrl, client) {
  if (imageCache.has(heroKey)) return imageCache.get(heroKey);
  const channelId = process.env.IMAGE_CHANNEL_ID;
  if (!channelId || !imageUrl) return imageUrl;

  const res = await fetch(imageUrl);
  const buf = Buffer.from(await res.arrayBuffer());
  const { width: W, height: H } = await sharp(buf).metadata();
  const stripH = Math.round(H * 0.075);
  const radius = Math.round(Math.min(W, H) * 0.06);

  const mask = Buffer.from(
    `<svg width="${W}" height="${H}"><path d="M0,${stripH} L${W - radius},${stripH} Q${W},${stripH} ${W},${stripH + radius} L${W},${H} L0,${H} Z" fill="white"/></svg>`
  );
  const processed = await sharp(buf)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  const channel = await client.channels.fetch(channelId);
  const msg     = await channel.send({ files: [new AttachmentBuilder(processed, { name: 'hero.png' })] });
  const url     = msg.attachments.first().url;
  imageCache.set(heroKey, url);
  saveImageCache();
  return url;
}

/* ── Widget push ──────────────────────────────────────────── */
async function pushWidget(userId, data) {
  const { username, battletag, rank, rankIcon, topHero, topHeroHrs,
          hours, games, wins, elims, assists, killstreakBest, title, heroPortrait } = data;

  const dynamic = [
    { type: 1, name: 'Top_Hero',        value: `${topHero} (${topHeroHrs}h)` },
    { type: 1, name: 'Rank',            value: rank },
    { type: 1, name: 'PlayerTitle',     value: title || '' },
    { type: 1, name: 'Battletag',       value: battletag },
    { type: 1, name: 'Time_Played',     value: `${hours} HRS` },
    { type: 1, name: 'Games_Played',    value: String(games) },
    { type: 1, name: 'Elims',           value: String(elims) },
    { type: 1, name: 'Assists',         value: String(assists) },
    { type: 1, name: 'Killstreak_Best', value: String(killstreakBest) },
    { type: 1, name: 'Games_Won',       value: String(wins) },
  ];
  if (heroPortrait) dynamic.push({ type: 3, name: 'Image',    value: { url: heroPortrait } });
  if (rankIcon)     dynamic.push({ type: 3, name: 'RankIcon', value: { url: rankIcon } });

  await fetch(
    `https://discord.com/api/v9/applications/${process.env.CLIENT_ID}/users/${userId}/identities/0/profile`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bot ${process.env.TOKEN}`,
        'User-Agent':    'DiscordBot (https://github.com/discord/discord-api-docs, 1.0.0)',
      },
      body: JSON.stringify({ username, data: { dynamic } }),
    }
  );
}

/* ── Core sync ────────────────────────────────────────────── */
async function syncUser(userId, battletag, client, force = false) {
  const tag = battletag.replace('#', '-');

  const [summaryRes, qpRes, compRes, heroData] = await Promise.all([
    fetch(`${BASE}/players/${encodeURIComponent(tag)}/summary`),
    fetch(`${BASE}/players/${encodeURIComponent(tag)}/stats/career?gamemode=quickplay`),
    fetch(`${BASE}/players/${encodeURIComponent(tag)}/stats/career?gamemode=competitive`),
    getHeroData(),
  ]);

  if (!summaryRes.ok) throw new Error(`Player not found: ${battletag}`);

  const summary = await summaryRes.json();
  const qp    = qpRes.ok    ? await qpRes.json()    : {};
  const comp2 = compRes.ok  ? await compRes.json()  : {};

  const allKeys = new Set([...Object.keys(qp), ...Object.keys(comp2)]);
  const stats = {};
  for (const key of allKeys) {
    const a = qp[key] ?? {}, b = comp2[key] ?? {};
    stats[key] = {
      game:    { time_played:  (a.game?.time_played  ?? 0) + (b.game?.time_played  ?? 0),
                 games_played: (a.game?.games_played ?? 0) + (b.game?.games_played ?? 0),
                 games_won:    (a.game?.games_won    ?? 0) + (b.game?.games_won    ?? 0) },
      combat:  { eliminations: (a.combat?.eliminations ?? 0) + (b.combat?.eliminations ?? 0) },
      assists: { assists:      (a.assists?.assists ?? 0)     + (b.assists?.assists ?? 0) },
      best:    { kill_streak_best: Math.max(a.best?.kill_streak_best ?? 0, b.best?.kill_streak_best ?? 0) },
    };
  }

  const [topKey] = Object.entries(stats)
    .filter(([k]) => k !== 'all-heroes')
    .sort((a, b) => (b[1].game?.time_played ?? 0) - (a[1].game?.time_played ?? 0))
    [0] ?? [];

  const hero         = heroData[topKey] ?? {};
  const topHero      = hero.name ?? 'N/A';
  const topHeroHrs   = topKey ? Math.floor((stats[topKey].game?.time_played ?? 0) / 3600) : 0;

  const agg          = stats['all-heroes'] ?? {};
  const hours        = Math.floor((agg.game?.time_played ?? 0) / 3600);
  const games        = agg.game?.games_played   ?? 0;
  const wins         = agg.game?.games_won      ?? 0;
  const elims        = agg.combat?.eliminations ?? 0;
  const assists      = agg.assists?.assists     ?? 0;
  const killstreakBest = agg.best?.kill_streak_best ?? 0;
  const title        = summary.title ?? '';

  const ORDER = ['bronze','silver','gold','platinum','diamond','master','grandmaster','champion'];
  const compRank = summary.competitive?.pc;
  const best     = ['tank','damage','support']
    .map(r => compRank?.[r]).filter(Boolean)
    .sort((a, b) => ORDER.indexOf(b.division) - ORDER.indexOf(a.division))[0];
  const rank     = best ? `${best.division[0].toUpperCase() + best.division.slice(1)} ${best.tier}` : 'Unranked';
  const rankIcon = best?.rank_icon ?? null;

  const displayTag = tag.replace(/-(\d+)$/, '#$1');

  // Skip Discord push if nothing changed since last sync (saves API quota)
  const fingerprint = JSON.stringify({ rank, topHero, topHeroHrs, hours, games, wins });
  if (!force && lastPushed.get(userId) === fingerprint) {
    return { username: summary.username, avatar: summary.avatar, rank, topHero, topHeroHrs, hours, games, wins, elims };
  }

  const heroPortrait = hero.portrait
    ? await processHeroImage(topKey, hero.portrait, client).catch(() => hero.portrait ?? null)
    : null;

  await pushWidget(userId, { username: summary.username, battletag: displayTag, rank, rankIcon,
    topHero, topHeroHrs, hours, games, wins, elims, assists, killstreakBest, title, heroPortrait });

  lastPushed.set(userId, fingerprint);
  return { username: summary.username, avatar: summary.avatar, rank, topHero, topHeroHrs, hours, games, wins, elims };
}

/* ── Refresh all registered users ─────────────────────────── */
async function refreshAll(client) {
  const users = getUsers();
  const entries = Object.entries(users);
  if (!entries.length) return;
  console.log(`[OverWidget] Refreshing ${entries.length} user(s)...`);
  for (const [userId, battletag] of entries) {
    await syncUser(userId, battletag, client)
      .then(() => console.log(`[OverWidget] ✓ ${battletag}`))
      .catch(e  => console.error(`[OverWidget] ✗ ${battletag}: ${e.message}`));
  }
}

/* ── Initial widget registration (blank push) ─────────────── */
async function initWidget(userId) {
  const dynamic = [
    { type: 1, name: 'Top_Hero',        value: '' },
    { type: 1, name: 'Rank',            value: '' },
    { type: 1, name: 'PlayerTitle',     value: '' },
    { type: 1, name: 'Battletag',       value: '' },
    { type: 1, name: 'Time_Played',     value: '' },
    { type: 1, name: 'Games_Played',    value: '' },
    { type: 1, name: 'Elims',           value: '' },
    { type: 1, name: 'Assists',         value: '' },
    { type: 1, name: 'Killstreak_Best', value: '' },
    { type: 1, name: 'Games_Won',       value: '' },
  ];
  const res = await fetch(
    `https://discord.com/api/v9/applications/${process.env.CLIENT_ID}/users/${userId}/identities/0/profile`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bot ${process.env.TOKEN}`,
        'User-Agent':    'DiscordBot (https://github.com/discord/discord-api-docs, 1.0.0)',
      },
      body: JSON.stringify({ data: { dynamic } }),
    }
  );
  if (!res.ok) throw new Error(`Widget init failed ${res.status}: ${await res.text()}`);
}

module.exports = { syncUser, refreshAll, getUsers, saveUsers, initWidget };
