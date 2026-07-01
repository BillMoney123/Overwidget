import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { startPoller as startOverwatchPoller, syncOnce as syncOverwatch } from './overwatch.mjs';

const TOKEN = process.env.TOKEN;

if (!TOKEN) {
  console.error('TOKEN is missing from .env');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log('='.repeat(40));
  console.log(`Bot: ${client.user.tag}`);
  console.log('='.repeat(40));
  // startOverwatchPoller(client);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'sync') {
    await interaction.deferReply({ ephemeral: true });
    try {
      await syncOverwatch();
      await interaction.editReply('Synced Overwatch widget.');
    } catch (err) {
      await interaction.editReply(`Error: \`${err.message}\``);
    }
  }
});

client.login(TOKEN);
