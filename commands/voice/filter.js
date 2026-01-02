const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const voiceManager = require('../../dist/utils/voiceManager');
const { createFilterMenu } = require('../../dist/components/select-menus/string/filterMenu');
const { createLogger } = require('../../dist/utils/logger');

const log = createLogger('FILTER');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('filter')
    .setDescription('Apply audio filters to playback'),

  async execute(interaction) {
    const guildId = interaction.guildId;

    log.info(`Filter command by ${interaction.user.tag} in ${interaction.guild.name}`);

    // Check if bot is in a voice channel
    const status = voiceManager.getStatus(guildId);
    if (!status) {
      return interaction.reply({
        content:
          "❌ I'm not in a voice channel! Use `/join` to connect me to your voice channel first.",
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      // Get current filters (placeholder - would integrate with voice system)
      const currentFilters = [];

      // Create and send the filter menu
      const filterMenu = createFilterMenu(guildId, currentFilters);

      await interaction.reply({
        content:
          '🎛️ **Audio Filter Selection**\n\nChoose audio filters to enhance your listening experience:\n\n• **Bass Boost** - Deeper, richer bass\n• **Nightcore** - Faster, higher pitch\n• **Vaporwave** - Slower, lower pitch\n• **8D Audio** - Surround sound effect\n\nSelect up to 3 filters or choose "None" to clear all filters.',
        components: [filterMenu],
        flags: MessageFlags.Ephemeral,
      });

      log.debug(`Filter menu sent to ${interaction.user.tag} in guild ${guildId}`);
    } catch (error) {
      log.error(`Failed to show filter menu: ${error.message}`);
      await interaction.reply({
        content: `❌ Failed to show filter menu: ${error.message}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
