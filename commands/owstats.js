const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { syncUser } = require('../lib/sync');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('owstats')
    .setDescription('Look up Overwatch stats for any player')
    .addStringOption(opt =>
      opt.setName('battletag').setDescription('e.g. Name-1234').setRequired(true)
    ),

  async execute(interaction) {
    const battletag = interaction.options.getString('battletag');
    const userId    = interaction.user.id;
    await interaction.deferReply();

    try {
      const data = await syncUser(userId, battletag, interaction.client);

      const embed = new EmbedBuilder()
        .setAuthor({ name: 'OverWidget' })
        .setTitle(data.username)
        .setThumbnail(data.avatar ?? null)
        .addFields(
          { name: 'Top Hero', value: `${data.topHero} (${data.topHeroHrs}h)`, inline: true },
          { name: 'Rank',     value: data.rank,                               inline: true },
          { name: 'Time',     value: `${data.hours}h`,                        inline: true },
          { name: 'Matches',  value: `${data.games}`,                         inline: true },
          { name: 'Wins',     value: `${data.wins}`,                          inline: true },
          { name: 'KOs',      value: data.elims.toLocaleString(),             inline: true },
        )
        .setColor(0xF5A623)
        .setFooter({ text: 'OverFast API • All Modes' });

      await interaction.editReply({ embeds: [embed] });
    } catch (e) {
      const msg = e.message.includes('not found')
        ? 'Player not found — make sure your Career Profile is **Public** in-game.'
        : `Error: ${e.message}`;
      await interaction.editReply(msg);
    }
  },
};
