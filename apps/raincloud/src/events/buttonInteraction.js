const { Events, MessageFlags } = require('discord.js');
const voiceManager = require('../../dist/utils/voiceManager');
const { createPlayerMessage } = require('../../dist/utils/playerEmbed');
const { createLogger } = require('../../dist/utils/logger');
const listeningHistory = require('../../dist/utils/listeningHistory');
const stats = require('../../dist/utils/statistics');
const { handleButtonInteraction, hasButtonHandler } = require('../../dist/handlers/buttonHandler');
const { parseButtonId } = require('@rainbot/utils');

const log = createLogger('BUTTONS');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isButton()) return;

    const startTime = Date.now();

    // Handle resume/dismiss buttons
    if (interaction.customId.startsWith('resume_')) {
      const userId = interaction.customId.replace('resume_', '');
      if (userId !== interaction.user.id) {
        stats.trackInteraction(
          'button',
          interaction.id,
          'resume',
          interaction.user.id,
          interaction.user.username,
          interaction.guildId,
          interaction.channelId,
          Date.now() - startTime,
          false,
          'Not authorized - wrong user',
          null
        );
        return interaction.reply({
          content: '❌ This resume prompt is not for you!',
          flags: MessageFlags.Ephemeral,
        });
      }

      try {
        const result = await voiceManager.resumeHistory(interaction.guildId, userId);
        const { nowPlaying, queue, currentTrack } = voiceManager.getQueue(interaction.guildId);

        await interaction.update({
          embeds: [
            {
              color: 0x10b981,
              title: '✅ Resumed',
              description: `Restored **${result.restored}** track${result.restored === 1 ? '' : 's'} from your listening history!`,
              timestamp: new Date().toISOString(),
            },
          ],
          components: [],
        });

        // Send player message to channel
        const channel = interaction.channel;
        if (channel) {
          const queueInfo = voiceManager.getQueue(interaction.guildId);
          await channel.send(
            createPlayerMessage(
              nowPlaying,
              queue,
              false,
              currentTrack,
              queueInfo,
              interaction.guildId
            )
          );
        }

        stats.trackInteraction(
          'button',
          interaction.id,
          'resume',
          interaction.user.id,
          interaction.user.username,
          interaction.guildId,
          interaction.channelId,
          Date.now() - startTime,
          true,
          null,
          { tracksRestored: result.restored }
        );
      } catch (error) {
        log.error(`Resume error: ${error.message}`);
        stats.trackInteraction(
          'button',
          interaction.id,
          'resume',
          interaction.user.id,
          interaction.user.username,
          interaction.guildId,
          interaction.channelId,
          Date.now() - startTime,
          false,
          error.message,
          null
        );
        await interaction
          .update({
            content: `❌ Failed to resume: ${error.message}`,
            embeds: [],
            components: [],
          })
          .catch(() => {});
      }
      return;
    }

    if (interaction.customId.startsWith('dismiss_history_')) {
      const userId = interaction.customId.replace('dismiss_history_', '');
      if (userId !== interaction.user.id) {
        stats.trackInteraction(
          'button',
          interaction.id,
          'dismiss_history',
          interaction.user.id,
          interaction.user.username,
          interaction.guildId,
          interaction.channelId,
          Date.now() - startTime,
          false,
          'Not authorized - wrong user',
          null
        );
        return interaction.reply({
          content: '❌ This prompt is not for you!',
          flags: MessageFlags.Ephemeral,
        });
      }

      await listeningHistory.clearListeningHistory(userId, interaction.guildId);
      await interaction.update({
        embeds: [
          {
            color: 0x6366f1,
            title: '👋 Dismissed',
            description: 'History cleared. Start fresh with `/play`!',
            timestamp: new Date().toISOString(),
          },
        ],
        components: [],
      });

      stats.trackInteraction(
        'button',
        interaction.id,
        'dismiss_history',
        interaction.user.id,
        interaction.user.username,
        interaction.guildId,
        interaction.channelId,
        Date.now() - startTime,
        true,
        null,
        null
      );
      return;
    }

    // Try to use the new handler system for player_ buttons
    if (interaction.customId.startsWith('player_')) {
      const { prefix } = parseButtonId(interaction.customId);

      // Check if we have a registered handler
      if (hasButtonHandler(prefix)) {
        try {
          const result = await handleButtonInteraction(interaction);

          // Track the interaction
          stats.trackInteraction(
            'button',
            interaction.id,
            prefix,
            interaction.user.id,
            interaction.user.username,
            interaction.guildId,
            interaction.channelId,
            Date.now() - startTime,
            result.success,
            result.error || null,
            result.data || null
          );

          return;
        } catch (error) {
          log.error(`Error in new handler system: ${error.message}`);
          // Fall through to legacy handling if new system fails
        }
      }
    }

    // Legacy button handling for any buttons not handled by new system
    if (!interaction.customId.startsWith('player_')) return;

    const guildId = interaction.guildId;
    const status = voiceManager.getStatus(guildId);
    const action = interaction.customId.replace('player_', '');

    if (!status) {
      stats.trackInteraction(
        'button',
        interaction.id,
        `player_${action}`,
        interaction.user.id,
        interaction.user.username,
        interaction.guildId,
        interaction.channelId,
        Date.now() - startTime,
        false,
        'Bot not in voice channel',
        null
      );
      return interaction.reply({
        content: "❌ I'm not in a voice channel!",
        flags: MessageFlags.Ephemeral,
      });
    }

    log.debug(`Button (legacy): ${action} by ${interaction.user.tag}`);
    log.warn('Using legacy button handler - this should be migrated to new system');

    try {
      switch (action) {
        case 'pause': {
          const result = voiceManager.togglePause(guildId);
          const queueInfo = voiceManager.getQueue(guildId);
          const { nowPlaying, queue, currentTrack } = queueInfo;
          await interaction.update(
            createPlayerMessage(nowPlaying, queue, result.paused, currentTrack, queueInfo, guildId)
          );
          stats.trackInteraction(
            'button',
            interaction.id,
            'player_pause',
            interaction.user.id,
            interaction.user.username,
            guildId,
            interaction.channelId,
            Date.now() - startTime,
            true,
            null,
            { paused: result.paused, nowPlaying }
          );
          break;
        }

        case 'skip': {
          const _skipped = voiceManager.skip(guildId, 1, interaction.user.id);
          // Small delay to let next track start
          await new Promise((r) => setTimeout(r, 500));
          const queueInfo = voiceManager.getQueue(guildId);
          const { nowPlaying, queue, currentTrack } = queueInfo;
          const skipStatus = voiceManager.getStatus(guildId);
          const isPaused = skipStatus ? !skipStatus.isPlaying : false;
          await interaction.update(
            createPlayerMessage(nowPlaying, queue, isPaused, currentTrack, queueInfo, guildId)
          );
          stats.trackInteraction(
            'button',
            interaction.id,
            'player_skip',
            interaction.user.id,
            interaction.user.username,
            guildId,
            interaction.channelId,
            Date.now() - startTime,
            true,
            null,
            { skippedTo: nowPlaying, queueLength: queue.length }
          );
          break;
        }

        case 'stop': {
          voiceManager.stopSound(guildId);
          await interaction.update({
            embeds: [
              {
                color: 0xef4444,
                title: '⏹️ Stopped',
                description:
                  'Playback stopped and queue cleared.\n\nUse `/play` to start playing music again.',
                timestamp: new Date().toISOString(),
              },
            ],
            components: [],
          });
          stats.trackInteraction(
            'button',
            interaction.id,
            'player_stop',
            interaction.user.id,
            interaction.user.username,
            guildId,
            interaction.channelId,
            Date.now() - startTime,
            true,
            null,
            null
          );
          break;
        }

        case 'queue': {
          const { nowPlaying, queue, totalInQueue, currentTrack } = voiceManager.getQueue(guildId);

          const formatDuration = (seconds) => {
            if (!seconds || isNaN(seconds)) return null;
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = Math.floor(seconds % 60);
            if (hours > 0) {
              return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
          };

          const embed = {
            color: 0x6366f1,
            title: '📋 Queue',
            timestamp: new Date().toISOString(),
          };

          // Now Playing
          if (nowPlaying && currentTrack) {
            const durationText = currentTrack.duration
              ? ` • \`${formatDuration(currentTrack.duration)}\``
              : '';
            embed.description = `**${nowPlaying}**${durationText}`;
          } else if (nowPlaying) {
            embed.description = `**${nowPlaying}**`;
          } else {
            embed.description = '*Nothing playing*';
          }

          // Queue list
          if (queue.length > 0) {
            const queueList = queue
              .slice(0, 10)
              .map((t, i) => {
                const num = (i + 1).toString().padStart(2, '0');
                const duration = t.duration ? ` \`${formatDuration(t.duration)}\`` : '';
                return `\`${num}\` ${t.title}${duration}`;
              })
              .join('\n');

            const moreText =
              totalInQueue > 10
                ? `\n\n*...and ${totalInQueue - 10} more track${totalInQueue - 10 === 1 ? '' : 's'}*`
                : '';

            embed.fields = [
              {
                name: `📋 Up Next — ${totalInQueue} track${totalInQueue === 1 ? '' : 's'}`,
                value: queueList + moreText,
                inline: false,
              },
            ];
          } else {
            embed.fields = [
              {
                name: '📋 Queue',
                value: '*Queue is empty*\n\nUse `/play` to add tracks!',
                inline: false,
              },
            ];
          }

          embed.footer = {
            text: `Total: ${totalInQueue} track${totalInQueue === 1 ? '' : 's'} in queue`,
          };

          await interaction.reply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral,
          });
          stats.trackInteraction(
            'button',
            interaction.id,
            'player_queue',
            interaction.user.id,
            interaction.user.username,
            guildId,
            interaction.channelId,
            Date.now() - startTime,
            true,
            null,
            { totalInQueue, nowPlaying }
          );
          break;
        }
      }
    } catch (error) {
      log.error(`Button error: ${error.message}`);
      stats.trackInteraction(
        'button',
        interaction.id,
        `player_${action}`,
        interaction.user.id,
        interaction.user.username,
        guildId,
        interaction.channelId,
        Date.now() - startTime,
        false,
        error.message,
        null
      );
      await interaction
        .reply({
          content: `❌ ${error.message}`,
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
    }
  },
};
