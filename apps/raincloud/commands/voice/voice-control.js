const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { createLogger } = require('../../dist/utils/logger');

const log = createLogger('VOICE_CONTROL_CMD');

// Lazy load multi-bot service for voice state manager
function getVoiceStateManager() {
  try {
    const { MultiBotService } = require('../../dist/apps/raincloud/lib/multiBotService');
    if (MultiBotService.isInitialized()) {
      return MultiBotService.getInstance().getVoiceStateManager();
    }
  } catch (error) {
    log.debug(`MultiBotService not available: ${error.message}`);
  }
  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('voice-control')
    .setDescription('Enable or disable voice command control for music')
    .addSubcommand((subcommand) =>
      subcommand.setName('enable').setDescription('Enable voice commands in this server')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('disable').setDescription('Disable voice commands in this server')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('status').setDescription('Check voice command status and statistics')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const subcommand = interaction.options.getSubcommand();

    const voiceStateManager = getVoiceStateManager();
    if (!voiceStateManager) {
      return interaction.reply({
        content:
          'âŒ Voice interaction system is not available. Please ensure Redis is properly configured.',
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      switch (subcommand) {
        case 'enable': {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          await voiceStateManager.setVoiceInteractionEnabled(guildId, true);

          log.info(
            `Voice control enabled for guild ${interaction.guild.name} by ${interaction.user.tag}`
          );

          await interaction.editReply({
            content: `âœ… **Voice commands enabled!**

Users in voice channels can now control music with voice commands.

**How to use:**
â€¢ Join a voice channel with the bot
â€¢ Simply speak commands like:
  - "Play [song name] by [artist]"
  - "Skip" or "Skip 2"
  - "Pause" / "Resume"
  - "Stop" / "Queue"
  - "Volume 50"

**Note:** Voice commands require API keys for speech recognition. Contact your bot administrator if voice commands don't work.`,
          });
          break;
        }

        case 'disable': {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          await voiceStateManager.setVoiceInteractionEnabled(guildId, false);

          log.info(
            `Voice control disabled for guild ${interaction.guild.name} by ${interaction.user.tag}`
          );

          await interaction.editReply({
            content:
              'âœ… Voice commands have been disabled. Users can still use slash commands to control music.',
          });
          break;
        }

        case 'status': {
          const isEnabled = await voiceStateManager.getVoiceInteractionEnabled(guildId);

          const statusMessage = isEnabled
            ? 'âœ… **Voice commands are enabled**'
            : 'âŒ **Voice commands are disabled**';

          await interaction.reply({
            content: statusMessage,
            flags: MessageFlags.Ephemeral,
          });
          break;
        }

        default:
          await interaction.reply({
            content: 'âŒ Unknown subcommand.',
            flags: MessageFlags.Ephemeral,
          });
      }
    } catch (error) {
      log.error(`Error executing voice-control command: ${error.message}`);
      const errorMessage = `âŒ Failed to ${subcommand} voice commands: ${error.message}`;

      if (interaction.deferred) {
        await interaction.editReply({ content: errorMessage });
      } else {
        await interaction.reply({
          content: errorMessage,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  },
};
