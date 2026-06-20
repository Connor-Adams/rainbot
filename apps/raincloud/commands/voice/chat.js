const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { createLogger } = require('@rainbot/utils/logger');

const log = createLogger('CHAT_CMD');

function getMultiBotService() {
  try {
    const { MultiBotService } = require('../../dist/apps/raincloud/lib/multiBotService');
    if (MultiBotService.isInitialized()) {
      return MultiBotService.getInstance();
    }
  } catch (error) {
    log.debug(`MultiBotService not available: ${error.message}`);
  }
  return null;
}

function getVoiceStateManager() {
  return getMultiBotService()?.getVoiceStateManager() ?? null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('chat')
    .setDescription('Enter or leave conversation mode with Grok in voice')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('on')
        .setDescription(
          'Turn on conversation mode — everyone in the voice channel can talk to Grok'
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('off')
        .setDescription('Turn off conversation mode — everyone returns to normal voice commands')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('toggle').setDescription('Toggle conversation mode on or off')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('status').setDescription('Check if conversation mode is on or off')
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const subcommand = interaction.options.getSubcommand();

    const voiceStateManager = getVoiceStateManager();
    if (!voiceStateManager) {
      return interaction.reply({
        content: '❌ Voice chat is not available. Please ensure Redis is properly configured.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const guildName = interaction.guild?.name ?? guildId;
    const requesterTag = interaction.user.tag;
    const replyEphemeral = (content) =>
      interaction.reply({
        content,
        flags: MessageFlags.Ephemeral,
      });
    const setModeAndReply = async (enabled, message) => {
      await voiceStateManager.setConversationMode(guildId, userId, enabled);
      // On enable, make Pranjeet actually listen: enabling conversation routing
      // alone is not enough — voice interaction must be on and the bot must
      // subscribe to current channel members (otherwise: joined, mode on, but
      // total silence). On disable we leave voice-control/listening as-is.
      if (enabled) {
        const service = getMultiBotService();
        if (service) {
          const result = await service.setConversationListening(guildId, true);
          if (!result?.success) {
            log.warn(
              `setConversationListening failed for guild ${guildId}: ${result?.message ?? 'unknown'}`
            );
          }
        }
      }
      log.info(
        `Conversation mode ${enabled ? 'on' : 'off'} for guild ${guildName} (requested by ${requesterTag})`
      );
      await replyEphemeral(message);
    };

    try {
      switch (subcommand) {
        case 'on': {
          await setModeAndReply(
            true,
            '✅ **Conversation mode on.** Everyone in the active voice channel can talk to Grok until it is turned off. Use `/chat off` or `/chat toggle` to exit.'
          );
          break;
        }

        case 'off': {
          await setModeAndReply(
            false,
            '✅ **Conversation mode off.** Everyone is back to normal voice commands.'
          );
          break;
        }

        case 'toggle': {
          const current = await voiceStateManager.getConversationMode(guildId);
          const next = !current;
          await setModeAndReply(
            next,
            next
              ? '✅ **Conversation mode on.** Everyone in the active voice channel can talk to Grok. Use `/chat toggle` again to turn off.'
              : '✅ **Conversation mode off.** Everyone is back to normal voice commands.'
          );
          break;
        }

        case 'status': {
          const isOn = await voiceStateManager.getConversationMode(guildId);
          await replyEphemeral(
            isOn
              ? '✅ **Conversation mode is on.** Everyone in the active voice channel can talk to Grok.'
              : '❌ **Conversation mode is off.** Use `/chat on` to start chatting.'
          );
          break;
        }

        default:
          await replyEphemeral('❌ Unknown subcommand.');
      }
    } catch (error) {
      log.error(`Error executing chat command: ${error.message}`);
      const errorMessage = `❌ Failed to ${subcommand} conversation mode: ${error.message}`;
      await interaction
        .reply({
          content: errorMessage,
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {
          if (interaction.deferred) {
            interaction.editReply({ content: errorMessage }).catch(() => {});
          }
        });
    }
  },
};
