const { SlashCommandBuilder } = require('discord.js');
const { syncUser, getUsers, saveUsers, initWidget } = require('../lib/sync');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('widget')
    .setDescription('OverWidget profile widget management')
    .addSubcommand(sub => sub
      .setName('link')
      .setDescription('Link your Overwatch account to your profile widget')
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

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'link') {
      const battletag = interaction.options.getString('battletag');
      const userId    = interaction.user.id;
      const displayTag = battletag.replace('-', '#');

      const users = getUsers();
      users[userId] = battletag.replace('#', '-');
      saveUsers(users);

      await initWidget(userId).catch(() => {});

      const snippet = `findByProps("getFeaturedApplicationIds").getFeaturedApplicationIds().push("${process.env.CLIENT_ID}");`;

      return interaction.reply({
        content: [
          `Linked **${displayTag}**. Your widget will sync automatically every 5 minutes.`,
          '',
          '**Step 1 — Activate the widget on your Discord profile:**',
          'Open Discord in your **browser** (`Ctrl+Shift+I` → Console), paste and run:',
          '```js',
          snippet,
          '```',
          '**Step 2 — Force a sync now:** Run **/widget refresh**',
        ].join('\n'),
        ephemeral: true,
      });
    }

    if (sub === 'unlink') {
      const users = getUsers();
      if (!users[interaction.user.id]) {
        return interaction.reply({ content: 'You are not linked. Use **/widget link** first.', ephemeral: true });
      }
      delete users[interaction.user.id];
      saveUsers(users);
      return interaction.reply({ content: 'Unlinked. Your widget will stop updating.', ephemeral: true });
    }

    if (sub === 'refresh') {
      const users     = getUsers();
      const battletag = users[interaction.user.id];
      if (!battletag) {
        return interaction.reply({ content: 'You are not linked. Use **/widget link <battletag>** first.', ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });
      try {
        const data = await syncUser(interaction.user.id, battletag, interaction.client, true);
        await interaction.editReply(`Widget updated! **${data.username}** — ${data.rank}, Top Hero: ${data.topHero} (${data.topHeroHrs}h)`);
      } catch (e) {
        await interaction.editReply(`Failed: ${e.message}`);
      }
    }
  },
};
