const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { createLogger } = require('@rainbot/utils');

const log = createLogger('VOICE_CONTROL_CMD');

// Lazy load voice interaction manager
let voiceInteractionManager = null;
function getVoiceInteractionManager() {
  if (!voiceInteractionManager) {
    try {
      const {
        getVoiceInteractionManager,
      } = require('../../dist/utils/voice/voiceInteractionInstance');
      voiceInteractionManager = getVoiceInteractionManager();
    } catch (error) {
      log.error(`Failed to load voice interaction manager: ${error.message}`);
      return null;
    }
  }
  return voiceInteractionManager;
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

    const manager = getVoiceInteractionManager();
    if (!manager) {
      return interaction.reply({
        content:
          '❌ Voice interaction system is not available. Please ensure the bot is properly configured.',
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      switch (subcommand) {
        case 'enable': {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          await manager.enableForGuild(guildId);

          log.info(
            `Voice control enabled for guild ${interaction.guild.name} by ${interaction.user.tag}`
          );

          await interaction.editReply({
            content: `✅ **Voice commands enabled!**

Users in voice channels can now control music with voice commands.

**How to use:**
• Join a voice channel with the bot
• Simply speak commands like:
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

          await manager.disableForGuild(guildId);

          log.info(
            `Voice control disabled for guild ${interaction.guild.name} by ${interaction.user.tag}`
          );

          await interaction.editReply({
            content:
              '✅ Voice commands have been disabled. Users can still use slash commands to control music.',
          });
          break;
        }

        case 'status': {
          const isEnabled = manager.isEnabledForGuild(guildId);
          const state = manager.getState(guildId);
          const stats = state?.statistics;

          let statusMessage = isEnabled
            ? '✅ **Voice commands are enabled**'
            : '❌ **Voice commands are disabled**';

          if (stats && stats.totalCommands > 0) {
            const successRate = ((stats.successfulCommands / stats.totalCommands) * 100).toFixed(1);

            statusMessage += `\n\n**Statistics:**
• Total commands: ${stats.totalCommands}
• Successful: ${stats.successfulCommands} (${successRate}%)
• Failed: ${stats.failedCommands}
• Average latency: ${stats.averageLatency.toFixed(0)}ms`;
          }

          if (state && state.sessions.size > 0) {
            statusMessage += `\n\n**Active sessions:** ${state.sessions.size} user(s) currently using voice commands`;
          }

          await interaction.reply({
            content: statusMessage,
            flags: MessageFlags.Ephemeral,
          });
          break;
        }

        default:
          await interaction.reply({
            content: '❌ Unknown subcommand.',
            flags: MessageFlags.Ephemeral,
          });
      }
    } catch (error) {
      log.error(`Error executing voice-control command: ${error.message}`);
      const errorMessage = `❌ Failed to ${subcommand} voice commands: ${error.message}`;

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
