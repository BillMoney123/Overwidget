# OverWidget — Setup Guide

OverWidget is a self-hosted Discord bot that displays your live Overwatch stats as a profile widget on Discord.

---

## Prerequisites

- [Node.js 18+](https://nodejs.org/)
- A Discord account with Developer Mode enabled
- An Overwatch account with a **public** Career Profile (Settings → Privacy → Career Profile: Public)
- Chrome, Edge, or Firefox browser

---

## Part 1 — Bot Owner Setup

This section is for the person hosting the bot. Do this once.

### Step 1: Clone the repo and install dependencies

```bash
git clone https://github.com/BillMoney123/Overwidget
cd Overwidget
npm install
```

### Step 2: Create your Discord application and widget

You'll use the **Discord Widget Creator** browser extension to create the application and import the OverWidget layout automatically.

**Install the extension:**

1. Download or clone https://github.com/TheCreativeGod/Discord-Widgets-Extension
2. **Chrome / Edge / Brave**: Go to `chrome://extensions` → Enable Developer Mode → Load unpacked → select the `chrome-extension/` folder from the downloaded extension
3. **Firefox**: Go to `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → select `firefox-extension/manifest.json`

**Create the widget:**

1. Go to https://discord.com/developers/applications (wait for the page to fully load)
2. **Reload the page once** after installing the extension
3. Click the **Widget Creator** button in the **bottom-right corner**
4. In the JSON box at the bottom, paste the full contents of **`widget-config.json`** from this repo
5. Click **Import** — the extension creates the application with the OverWidget layout pre-configured
6. Solve the captcha / enter 2FA if prompted

After the extension finishes, note down from the Developer Portal:
- **Application ID** (General Information page)
- **Bot Token** (Bot page → Reset Token)

### Step 3: Create an image upload channel

The bot needs a private Discord channel to upload processed hero portrait images.

1. Create or pick a text channel in your server (e.g. `#widget-images`)
2. Make it **private** — only the bot needs to see it
3. Right-click the channel → **Copy Channel ID** (requires Developer Mode)

### Step 4: Configure `.env`

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

```env
TOKEN=your_bot_token_here
CLIENT_ID=your_application_id_here
GUILD_ID=your_server_id_here
DISCORD_USER_ID=your_discord_user_id_here
IMAGE_CHANNEL_ID=channel_id_for_hero_image_uploads
```

To get your **User ID**: Discord → Settings → Advanced → Enable Developer Mode, then right-click your name → Copy User ID.

To get your **Server ID**: right-click your server icon → Copy Server ID.

### Step 5: Invite the bot to your server

Open this URL in your browser, replacing `YOUR_CLIENT_ID` with your Application ID:

```
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=51200&scope=bot%20applications.commands
```

Select your server from the dropdown and click **Authorize**.

### Step 6: Deploy commands and start the bot

```bash
npm run deploy   # registers /widget and /owstats slash commands
npm start        # starts the bot
```

The bot will log `Logged in as OverWidget#1234` when ready.

---

## Part 2 — Linking Your Account

This section is for anyone who wants their Overwatch stats on their Discord profile.

### Step 1: Set up your widget using the extension

1. Install the **Discord Widget Creator** extension (links in Part 1 above)
2. Go to https://discord.com/developers/applications and reload the page once
3. Click the **Widget Creator** button in the bottom-right corner
4. Paste the contents of **`widget-config.json`** (from this repo) into the JSON box
5. Click **Import** — the extension creates the application with the OverWidget layout pre-configured
6. Complete any captcha / 2FA if prompted

The extension adds the widget to your Discord profile automatically.

### Step 2: Register your BattleTag

Run this command in the Discord server where the bot is active:

```
/widget link <YourBattleTag#1234>
```

Replace `<YourBattleTag#1234>` with your actual BattleTag (e.g. `Name#1234`). The bot will save it and start tracking your stats.

### Step 3: Sync your stats

```
/widget refresh
```

Your Overwatch stats will now appear on your Discord profile. The bot refreshes everyone's stats automatically every hour.

---

## Commands

| Command | Description |
|---|---|
| `/widget link <battletag>` | Link your Overwatch account |
| `/widget refresh` | Force-sync your stats immediately |
| `/widget unlink` | Remove your account from OverWidget |
| `/owstats <battletag>` | Look up stats for any player |

---

## Troubleshooting

**Widget shows "Your game stats are still syncing. Keep playing!"**  
The bot has not pushed data yet. Run `/widget refresh`.

**`/widget refresh` returns "Player not found"**  
Your Overwatch Career Profile must be set to **Public** in-game (Options → Social → Career Profile: Public).

**Stats look outdated**  
The bot syncs every 5 minutes automatically. Run `/widget refresh` to force an immediate update.

**Bot is online but commands don't appear**  
Run `npm run deploy` again. Global commands can take up to 1 hour to propagate.
