import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID) {
  console.error('TOKEN and CLIENT_ID are required in .env');
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName('owstats')
    .setDescription('Look up Overwatch stats for any player')
    .addStringOption(opt =>
      opt.setName('battletag').setDescription('e.g. Name-1234').setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('widget')
    .setDescription('OverWidget profile widget management')
    .addSubcommand(sub => sub
      .setName('link')
      .setDescription('Link your Overwatch account to your Discord profile widget')
      .addStringOption(opt =>
        opt.setName('battletag').setDescription('Your BattleTag e.g. Name-1234').setRequired(true)
      )
    )
    .addSubcommand(sub => sub
      .setName('unlink')
      .setDescription('Remove your account from OverWidget')
    )
    .addSubcommand(sub => sub
      .setName('refresh')
      .setDescription('Manually refresh your profile widget right now')
    ),
].map(c => c.toJSON());

const rest = new REST().setToken(TOKEN);

if (GUILD_ID) {
  console.log('Clearing guild-specific commands (fixes duplicates)...');
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });
  console.log('Guild commands cleared.');
}

console.log('Registering global slash commands...');
await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
console.log('Done. Global commands take up to 1 hour to propagate.');
