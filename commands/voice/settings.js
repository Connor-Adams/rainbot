const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { createRepeatModeMenu } = require('../../dist/components/select-menus/string/repeatModeMenu');
const { createLogger } = require('../../dist/utils/logger');

const log = createLogger('SETTINGS');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Configure bot settings for this server'),

  async execute(interaction) {
    const guildId = interaction.guildId;

    log.info(`Settings command by ${interaction.user.tag} in ${interaction.guild.name}`);

    try {
      // Get current settings (placeholder - would integrate with database)
      const currentRepeatMode = 'off';

      // Create the repeat mode menu
      const repeatModeMenu = createRepeatModeMenu(guildId, currentRepeatMode);

      // Create embed with settings information
      const embed = {
        color: 0x6366f1,
        title: '⚙️ Server Settings',
        description: 'Configure how the bot behaves in this server.',
        fields: [
          {
            name: '🔁 Repeat Mode',
            value: 'Use the menu below to change repeat behavior',
            inline: false,
          },
          {
            name: 'Current Settings',
            value: `**Repeat Mode:** ${currentRepeatMode}\n*More settings coming soon!*`,
            inline: false,
          },
        ],
        footer: {
          text: 'Settings are saved per server',
        },
        timestamp: new Date().toISOString(),
      };

      await interaction.reply({
        embeds: [embed],
        components: [repeatModeMenu],
        flags: MessageFlags.Ephemeral,
      });

      log.debug(`Settings menu sent to ${interaction.user.tag} in guild ${guildId}`);
    } catch (error) {
      log.error(`Failed to show settings menu: ${error.message}`);
      await interaction.reply({
        content: `❌ Failed to show settings: ${error.message}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
