require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, Collection } = require('discord.js');
const { refreshAll } = require('./lib/sync');
const owstats = require('./commands/owstats');
const widget  = require('./commands/widget');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

for (const cmd of [owstats, widget]) {
  client.commands.set(cmd.data.name, cmd);
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);

  const POLL_MS = 5 * 60 * 1000; // poll every 5 minutes
  refreshAll(client).catch(console.error);
  setInterval(() => refreshAll(client).catch(console.error), POLL_MS);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const cmd = client.commands.get(interaction.commandName);
  if (cmd) await cmd.execute(interaction).catch(console.error);
});

const rest = new REST().setToken(process.env.TOKEN);

(async () => {
  const GUILD_ID = process.env.GUILD_ID;
  if (GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, GUILD_ID), { body: [] });
    console.log('Cleared guild-specific commands.');
  }
  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: [owstats.data.toJSON(), widget.data.toJSON()] },
  );
  await client.login(process.env.TOKEN);
})().catch(console.error);
