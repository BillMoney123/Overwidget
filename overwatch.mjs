import 'dotenv/config';

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const DISCORD_USER_ID = process.env.DISCORD_USER_ID;
const OW_BATTLETAG = process.env.OW_BATTLETAG; // format: PlayerName-1234

const OVERFAST_BASE = 'https://overfast-api.tekrop.fr';
const DISCORD_API = 'https://discord.com/api/v9';
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function fetchOverwatchStats() {
  if (!OW_BATTLETAG) throw new Error('OW_BATTLETAG not set in .env');

  const res = await fetch(`${OVERFAST_BASE}/players/${OW_BATTLETAG}/stats/summary`);
  if (!res.ok) throw new Error(`Overfast API error ${res.status}: ${await res.text()}`);
  return res.json();
}

function mapToWidgetPayload(stats) {
  // TODO: fill in your widget field names once your OW widget is configured
  return {
    username: OW_BATTLETAG.replace(/-\d+$/, ''),
    data: {
      dynamic: [
        // Examples — swap field names to match your widget config:
        // { type: 2, name: 'OW_Wins',       value: stats.general?.games_won        ?? 0 },
        // { type: 2, name: 'OW_Played',     value: stats.general?.games_played     ?? 0 },
        // { type: 1, name: 'OW_TopHero',    value: stats.top_heroes?.[0]?.hero     ?? 'N/A' },
      ],
    },
  };
}

async function pushWidget(payload) {
  const res = await fetch(
    `${DISCORD_API}/applications/${CLIENT_ID}/users/${DISCORD_USER_ID}/identities/0/profile`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bot ${TOKEN}`,
        'User-Agent': 'DiscordBot (https://github.com/discord/discord-api-docs, 1.0.0)',
      },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) throw new Error(`Discord widget error ${res.status}: ${await res.text()}`);
}

export async function syncOnce() {
  const stats = await fetchOverwatchStats();
  const payload = mapToWidgetPayload(stats);
  await pushWidget(payload);
  console.log('[Overwatch] Widget updated.');
}

export function startPoller() {
  syncOnce().catch(err => console.error('[Overwatch] Initial sync failed:', err.message));
  setInterval(() => {
    syncOnce().catch(err => console.error('[Overwatch] Sync failed:', err.message));
  }, POLL_INTERVAL_MS);
  console.log(`[Overwatch] Poller started — syncing every ${POLL_INTERVAL_MS / 60000} minutes.`);
}
