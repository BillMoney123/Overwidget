import { createInterface } from "readline/promises";
import { stdin, stdout } from "process";

const rl = createInterface({ input: stdin, output: stdout });

const DISCORD_API = "https://discord.com/api/v9";
const USER_AGENT = "DiscordBot (https://github.com/discord/discord-api-docs, 1.0.0)";

const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
};

function log(msg) { console.log(msg); }
function ok(msg) { log(`${colors.green}✓${colors.reset} ${msg}`); }
function warn(msg) { log(`${colors.yellow}⚠${colors.reset} ${msg}`); }
function fail(msg) { log(`${colors.red}✗${colors.reset} ${msg}`); }
function info(msg) { log(`${colors.cyan}→${colors.reset} ${msg}`); }
function header(msg) { log(`\n${colors.bold}${msg}${colors.reset}\n${"─".repeat(50)}`); }

async function prompt(msg) {
  const answer = await rl.question(`${colors.cyan}?${colors.reset} ${msg}: `);
  return answer.trim();
}

async function promptConfirm(msg) {
  const answer = await prompt(`${msg} (y/n)`);
  return answer.toLowerCase().startsWith("y");
}

async function discordFetch(path, options = {}) {
  const res = await fetch(`${DISCORD_API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      ...options.headers,
    },
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, ok: res.ok, json, text };
}

async function validateBotToken(token) {
  const res = await discordFetch("/users/@me", {
    headers: { Authorization: `Bot ${token}` },
  });
  return res.ok ? res.json : null;
}

async function validateAppId(appId, token) {
  const res = await discordFetch(`/applications/${appId}`, {
    headers: { Authorization: `Bot ${token}` },
  });
  return res.ok ? res.json : null;
}

async function patchIdentity(appId, userId, token, payload) {
  return discordFetch(
    `/applications/${appId}/users/${userId}/identities/0/profile`,
    {
      method: "PATCH",
      headers: { Authorization: `Bot ${token}` },
      body: JSON.stringify(payload),
    }
  );
}

async function collectWidgetFields() {
  log("");
  info("Enter your widget field data. These field names must match your widget editor config.");
  info("Type 'done' when finished.\n");

  const fields = [];
  let i = 1;

  while (true) {
    const name = await prompt(`Field ${i} name (or 'done')`);
    if (name.toLowerCase() === "done") break;

    const value = await prompt(`Field ${i} value`);
    const isImage = await promptConfirm("Is this an image field?");

    fields.push({
      type: isImage ? 3 : 1,
      name,
      value: isImage ? { url: value } : value,
    });
    i++;
  }

  return fields;
}

async function run() {
  log(`\n${colors.bold}Discord Widget v2 Setup Tool${colors.reset}`);
  log(`${"═".repeat(50)}\n`);

  header("Step 1: Credentials");

  const appId = await prompt("Application ID (from Developer Portal → General Information)");
  if (!appId) { fail("Application ID is required."); process.exit(1); }

  const botToken = await prompt("Bot Token (from Developer Portal → Bot → Reset Token)");
  if (!botToken) { fail("Bot Token is required."); process.exit(1); }

  const userId = await prompt("Your Discord User ID (enable Developer Mode → right-click yourself → Copy User ID)");
  if (!userId) { fail("User ID is required."); process.exit(1); }

  info("Validating bot token...");
  const botUser = await validateBotToken(botToken);
  if (!botUser) {
    fail("Bot token is invalid. Go to Developer Portal → Bot → Reset Token and copy the new one.");
    process.exit(1);
  }
  ok(`Bot authenticated as: ${botUser.username}`);

  info("Validating application...");
  const app = await validateAppId(appId, botToken);
  if (!app) {
    fail("Could not fetch application. Make sure the App ID matches the bot token's application.");
    process.exit(1);
  }
  ok(`Application: ${app.name}`);

  header("Step 2: OAuth2 Authorization");

  const oauthUrl =
    `https://discord.com/oauth2/authorize?client_id=${appId}` +
    `&response_type=token&scope=openid+sdk.social_layer` +
    `&redirect_uri=https%3A%2F%2Fdiscord.com`;

  log("");
  warn("You MUST authorize yourself with the app, or the widget shows");
  warn('"Your game stats are still syncing. Keep playing!" forever.\n');
  info("Prerequisites:");
  log("   1. Developer Portal → OAuth2 → Redirects → add: https://discord.com");
  log("   2. Click Save Changes\n");
  info("Open this URL in your browser and click Authorize:\n");
  log(`   ${colors.cyan}${oauthUrl}${colors.reset}\n`);
  log("   After authorizing, you'll redirect to discord.com — that's expected.\n");

  await promptConfirm("Have you completed the OAuth2 authorization?");

  info("Verifying: check Discord Settings → Authorized Apps → look for your app.");
  info("It needs: activity status, profile info, friends list, DMs, etc.\n");
  const authConfirmed = await promptConfirm("Is the app visible in Authorized Apps with full permissions?");
  if (!authConfirmed) {
    warn("Try the OAuth URL again. Make sure response_type=token (not code) and both scopes are checked.");
  }

  header("Step 3: Widget Data");

  const hasJson = await promptConfirm("Do you have the generated JSON from the widget editor's Sample Data tab?");

  let payload;

  if (hasJson) {
    log("\nPaste the JSON string (single line):");
    const rawJson = await prompt("JSON");
    try {
      const parsed = JSON.parse(rawJson);
      if (!parsed.username) parsed.username = "Player";
      payload = parsed;
      ok("JSON parsed successfully.");
    } catch {
      fail("Invalid JSON. Make sure you copied the full output from 'Generate JSON'.");
      process.exit(1);
    }
  } else {
    info("We'll build the payload manually.\n");
    const displayName = await prompt("Display name for the widget (shown as the title)");
    const fields = await collectWidgetFields();

    if (fields.length === 0) {
      warn("No fields entered. Sending minimal payload to clear the syncing message.");
    }

    payload = {
      username: displayName || "Player",
      data: { dynamic: fields },
    };
  }

  header("Step 4: Push Data to Discord");

  log(`\nPayload preview:\n${colors.dim}${JSON.stringify(payload, null, 2)}${colors.reset}\n`);

  const confirmPatch = await promptConfirm("Send this to Discord?");
  if (!confirmPatch) { info("Aborted."); process.exit(0); }

  info("PATCHing identity...");
  const res = await patchIdentity(appId, userId, botToken, payload);

  if (res.ok) {
    ok("Identity pushed successfully! The 'still syncing' message should be gone.");
  } else {
    fail(`Discord API returned ${res.status}`);
    log(`${colors.dim}${res.text}${colors.reset}\n`);

    if (res.status === 401) {
      fail("Auth failed. Reset your bot token and try again.");
    } else if (res.status === 403) {
      fail("Forbidden. The user likely hasn't authorized with openid + sdk.social_layer.");
      fail("Re-do the OAuth2 step.");
    } else if (res.status === 404) {
      fail("Not found. Double-check your Application ID and User ID.");
    } else if (res.json?.code === 50035) {
      fail("Validation error. Your JSON field names don't match the widget config.");
      if (res.json.errors) {
        log(`${colors.dim}${JSON.stringify(res.json.errors, null, 2)}${colors.reset}`);
      }
    }
    process.exit(1);
  }

  header("Step 5: Add Widget to Profile");

  log("\nThis step must be done in Discord's dev tools (Ctrl+Shift+I / F12).\n");
  info("Option A — Add directly to profile:\n");

  const snippetDirect = `fetch("/api/v9/users/@me/profile", {method:"PATCH",headers:{"Content-Type":"application/json",Authorization:document.body.querySelector('[class*="app"]').__reactFiber$?.return?.return?.return?.return?.return?.return?.return?.memoizedState?.memoizedState?.queue?.lastRenderedState?.token ? undefined : undefined},body:JSON.stringify({widget_application_ids:["${appId}"]})});`;

  log(`${colors.dim}   (Paste in Discord client's console — see Discord Previews thread for the latest snippet)${colors.reset}\n`);

  info("Option B — Use the Discord Previews thread:\n");
  log(`   ${colors.cyan}https://discord.com/channels/603970300668805120/1509942620762276011${colors.reset}\n`);
  log("   Join that server, find the latest snippet, paste it in your Discord client's console.\n");

  info("Option C — If the widget already appears in + Add Widget menu, just select it from there.\n");

  header("Step 6: Enable Experiment");

  log("\nThe experiment ${colors.bold}2026-03-application-widget-v2-renderer${colors.reset} must be Variant 1.");
  log("If you don't know how to toggle experiments, ask in the Discord Previews general channel.\n");

  header("Done");

  ok("Setup complete. If the 'problem updating profile' error persists:");
  log("   1. Confirm the experiment is on Variant 1");
  log("   2. Confirm OAuth2 authorization is in Authorized Apps");
  log("   3. Try removing and re-adding the widget to your profile");
  log("");

  rl.close();
}

run().catch((err) => {
  fail(`Unexpected error: ${err.message}`);
  rl.close();
  process.exit(1);
});
