const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { createLogger } = require('../../dist/utils/logger');

const log = createLogger('CHAT_CMD');

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

    try {
      switch (subcommand) {
        case 'on': {
          await voiceStateManager.setConversationMode(guildId, userId, true);
          log.info(
            `Conversation mode on for guild ${interaction.guild?.name} (requested by ${interaction.user.tag})`
          );
          await interaction.reply({
            content:
              '✅ **Conversation mode on.** Everyone in the active voice channel can talk to Grok until it is turned off. Use `/chat off` or `/chat toggle` to exit.',
            flags: MessageFlags.Ephemeral,
          });
          break;
        }

        case 'off': {
          await voiceStateManager.setConversationMode(guildId, userId, false);
          log.info(
            `Conversation mode off for guild ${interaction.guild?.name} (requested by ${interaction.user.tag})`
          );
          await interaction.reply({
            content: '✅ **Conversation mode off.** Everyone is back to normal voice commands.',
            flags: MessageFlags.Ephemeral,
          });
          break;
        }

        case 'toggle': {
          const current = await voiceStateManager.getConversationMode(guildId, userId);
          const next = !current;
          await voiceStateManager.setConversationMode(guildId, userId, next);
          log.info(
            `Conversation mode toggled to ${next} for guild ${interaction.guild?.name} (requested by ${interaction.user.tag})`
          );
          await interaction.reply({
            content: next
              ? '✅ **Conversation mode on.** Everyone in the active voice channel can talk to Grok. Use `/chat toggle` again to turn off.'
              : '✅ **Conversation mode off.** Everyone is back to normal voice commands.',
            flags: MessageFlags.Ephemeral,
          });
          break;
        }

        case 'status': {
          const isOn = await voiceStateManager.getConversationMode(guildId, userId);
          await interaction.reply({
            content: isOn
              ? '✅ **Conversation mode is on.** Everyone in the active voice channel can talk to Grok.'
              : '❌ **Conversation mode is off.** Use `/chat on` to start chatting.',
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
