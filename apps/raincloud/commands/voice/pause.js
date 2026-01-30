/**
 * Pause command - Multi-bot architecture version
 */
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { createLogger } = require('../../dist/utils/logger');
const { validateVoiceConnection, createErrorResponse } = require('../utils/commandHelpers');

const log = createLogger('PAUSE');

// Try to use multi-bot service, fall back to local voiceManager
async function getPlaybackService() {
  try {
    const { MultiBotService } = require('../../dist/lib/multiBotService');
    if (MultiBotService.isInitialized()) {
      return { type: 'multibot', service: MultiBotService.getInstance() };
    }
  } catch {
    // Multi-bot service not available
  }

  const voiceManager = require('../../dist/utils/voiceManager');
  return { type: 'local', service: voiceManager };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Toggle pause/resume playback (pauses if playing, resumes if paused)'),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const { type, service } = await getPlaybackService();

    if (type === 'multibot') {
      const status = await service.getStatus(guildId);
      if (!status || !status.connected) {
        return interaction.reply({
          content: "❌ I'm not in a voice channel! Use `/join` first.",
          flags: MessageFlags.Ephemeral,
        });
      }

      try {
        const result = await service.togglePause(guildId);
        const queueInfo = await service.getQueue(guildId);
        const trackInfo = queueInfo.nowPlaying?.title ? ` **${queueInfo.nowPlaying.title}**` : '';

        if (result.paused) {
          log.info(`Paused by ${interaction.user.tag}`);
          await interaction.reply(`⏸️ Paused playback${trackInfo}.`);
        } else {
          log.info(`Resumed by ${interaction.user.tag}`);
          await interaction.reply(`▶️ Resumed playback${trackInfo}.`);
        }
      } catch (error) {
        log.error(`Pause error: ${error.message}`);
        await interaction.reply(
          createErrorResponse(
            error,
            '',
            '💡 **Tip:** Make sure something is playing before trying to pause.'
          )
        );
      }
    } else {
      // Local voiceManager fallback
      const voiceManager = service;
      const connectionCheck = validateVoiceConnection(interaction, voiceManager);
      if (!connectionCheck.isValid) {
        return interaction.reply(connectionCheck.error);
      }

      try {
        const result = voiceManager.togglePause(guildId);

        if (result.paused) {
          log.info(`Paused by ${interaction.user.tag}`);
          const { nowPlaying } = voiceManager.getQueue(guildId);
          const trackInfo = nowPlaying?.title ? ` **${nowPlaying.title}**` : '';
          await interaction.reply(`⏸️ Paused playback${trackInfo}.`);
        } else {
          log.info(`Resumed by ${interaction.user.tag}`);
          const { nowPlaying } = voiceManager.getQueue(guildId);
          const trackInfo = nowPlaying?.title ? ` **${nowPlaying.title}**` : '';
          await interaction.reply(`▶️ Resumed playback${trackInfo}.`);
        }
      } catch (error) {
        log.error(`Pause error: ${error.message}`);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(
            createErrorResponse(
              error,
              '',
              '💡 **Tip:** Make sure something is playing before trying to pause.'
            )
          );
        } else {
          await interaction.reply(
            createErrorResponse(
              error,
              '',
              '💡 **Tip:** Make sure something is playing before trying to pause.'
            )
          );
        }
      }
    }
  },
};
