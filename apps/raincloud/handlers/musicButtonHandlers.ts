/**
 * Music control button handlers
 */

import { MessageFlags } from 'discord.js';
import type { APIEmbed } from 'discord.js';
import type { ButtonHandler } from '@rainbot/types/buttons';
import type { MediaItem } from '@rainbot/types/media';
import { createLogger } from '@utils/logger';
import MultiBotService, { getMultiBotService } from '../lib/multiBotService';
import { createPlayerMessage } from '@utils/playerEmbed';

const log = createLogger('MUSIC_BUTTONS');

/**
 * Handle pause/resume button
 */
export const handlePauseButton: ButtonHandler = async (interaction, context) => {
  const { guildId } = context;

  if (!guildId) {
    await interaction.reply({
      content: '❌ Guild ID not found',
      flags: MessageFlags.Ephemeral,
    });
    return { success: false, error: 'No guild ID' };
  }

  const multiBot = MultiBotService.isInitialized() ? getMultiBotService() : null;
  if (!multiBot) {
    await interaction.reply({
      content: '❌ Worker services are not ready.',
      flags: MessageFlags.Ephemeral,
    });
    return { success: false, error: 'Workers unavailable' };
  }

  const status = await multiBot.getStatus(guildId);
  if (!status) {
    await interaction.reply({
      content: "❌ I'm not in a voice channel!",
      flags: MessageFlags.Ephemeral,
    });
    return { success: false, error: 'Bot not in voice channel' };
  }

  try {
    const result = await multiBot.togglePause(guildId);
    const queueState = await multiBot.getQueue(guildId);
    const mediaState = await multiBot.getStatus(guildId);
    const updatedMedia =
      mediaState && queueState ? { ...mediaState, queue: queueState } : mediaState;

    await interaction.update(createPlayerMessage(updatedMedia, guildId));

    return {
      success: true,
      data: { paused: result.paused },
    };
  } catch (error) {
    log.error(`Pause button error: ${error}`);
    await interaction
      .reply({
        content: `❌ ${error instanceof Error ? error.message : 'Unknown error'}`,
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => {});
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Handle skip button
 */
export const handleSkipButton: ButtonHandler = async (interaction, context) => {
  const { guildId } = context;

  if (!guildId) {
    await interaction.reply({
      content: '❌ Guild ID not found',
      flags: MessageFlags.Ephemeral,
    });
    return { success: false, error: 'No guild ID' };
  }

  const multiBot = MultiBotService.isInitialized() ? getMultiBotService() : null;
  if (!multiBot) {
    await interaction.reply({
      content: '❌ Worker services are not ready.',
      flags: MessageFlags.Ephemeral,
    });
    return { success: false, error: 'Workers unavailable' };
  }

  const status = await multiBot.getStatus(guildId);
  if (!status) {
    await interaction.reply({
      content: "❌ I'm not in a voice channel!",
      flags: MessageFlags.Ephemeral,
    });
    return { success: false, error: 'Bot not in voice channel' };
  }

  try {
    await multiBot.skip(guildId, 1);

    // Small delay to let next track start
    await new Promise((resolve) => setTimeout(resolve, 500));

    const queueState = await multiBot.getQueue(guildId);
    const mediaState = await multiBot.getStatus(guildId);
    const updatedMedia =
      mediaState && queueState ? { ...mediaState, queue: queueState } : mediaState;

    await interaction.update(createPlayerMessage(updatedMedia, guildId));

    const nowPlaying = updatedMedia?.queue?.nowPlaying?.title ?? null;
    return {
      success: true,
      data: { nowPlaying },
    };
  } catch (error) {
    log.error(`Skip button error: ${error}`);
    await interaction
      .reply({
        content: `❌ ${error instanceof Error ? error.message : 'Unknown error'}`,
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => {});
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Handle stop button
 */
export const handleStopButton: ButtonHandler = async (interaction, context) => {
  const { guildId } = context;

  if (!guildId) {
    await interaction.reply({
      content: '❌ Guild ID not found',
      flags: MessageFlags.Ephemeral,
    });
    return { success: false, error: 'No guild ID' };
  }

  const multiBot = MultiBotService.isInitialized() ? getMultiBotService() : null;
  if (!multiBot) {
    await interaction.reply({
      content: '❌ Worker services are not ready.',
      flags: MessageFlags.Ephemeral,
    });
    return { success: false, error: 'Workers unavailable' };
  }

  const status = await multiBot.getStatus(guildId);
  if (!status) {
    await interaction.reply({
      content: "❌ I'm not in a voice channel!",
      flags: MessageFlags.Ephemeral,
    });
    return { success: false, error: 'Bot not in voice channel' };
  }

  try {
    await multiBot.stop(guildId);

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

    return { success: true };
  } catch (error) {
    log.error(`Stop button error: ${error}`);
    await interaction
      .reply({
        content: `❌ ${error instanceof Error ? error.message : 'Unknown error'}`,
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => {});
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Handle queue view button
 */
export const handleQueueButton: ButtonHandler = async (interaction, context) => {
  const { guildId } = context;

  if (!guildId) {
    await interaction.reply({
      content: '❌ Guild ID not found',
      flags: MessageFlags.Ephemeral,
    });
    return { success: false, error: 'No guild ID' };
  }

  const multiBot = MultiBotService.isInitialized() ? getMultiBotService() : null;
  if (!multiBot) {
    await interaction.reply({
      content: '❌ Worker services are not ready.',
      flags: MessageFlags.Ephemeral,
    });
    return { success: false, error: 'Workers unavailable' };
  }

  const status = await multiBot.getStatus(guildId);
  if (!status) {
    await interaction.reply({
      content: "❌ I'm not in a voice channel!",
      flags: MessageFlags.Ephemeral,
    });
    return { success: false, error: 'Bot not in voice channel' };
  }

  try {
    const queueState = await multiBot.getQueue(guildId);
    const nowPlaying = queueState.nowPlaying?.title ?? null;
    const currentTrack = queueState.nowPlaying ?? null;
    const queue = queueState.queue ?? [];
    const totalInQueue = queue.length;

    const formatDuration = (seconds: number | null | undefined): string | null => {
      if (!seconds || isNaN(seconds)) return null;
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      }
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    };

    const embed: APIEmbed = {
      color: 0x6366f1,
      title: '📋 Queue',
      timestamp: new Date().toISOString(),
    };

    // Now Playing
    if (nowPlaying && currentTrack) {
      const durationSeconds =
        currentTrack.duration ?? (currentTrack.durationMs ? currentTrack.durationMs / 1000 : null);
      const durationText = durationSeconds ? ` • \`${formatDuration(durationSeconds)}\`` : '';
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
        .map((t: MediaItem, i: number) => {
          const num = (i + 1).toString().padStart(2, '0');
          const durationSeconds = t.duration ?? (t.durationMs ? t.durationMs / 1000 : null);
          const duration = durationSeconds ? ` \`${formatDuration(durationSeconds)}\`` : '';
          return `\`${num}\` ${t.title ?? 'Unknown'}${duration}`;
        })
        .join('\n');

      const moreText =
        (totalInQueue ?? 0) > 10
          ? `\n\n*...and ${(totalInQueue ?? 0) - 10} more track${(totalInQueue ?? 0) - 10 === 1 ? '' : 's'}*`
          : '';

      embed.fields = [
        {
          name: `📋 Up Next — ${totalInQueue ?? 0} track${(totalInQueue ?? 0) === 1 ? '' : 's'}`,
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

    return {
      success: true,
      data: { totalInQueue },
    };
  } catch (error) {
    log.error(`Queue button error: ${error}`);
    await interaction
      .reply({
        content: `❌ ${error instanceof Error ? error.message : 'Unknown error'}`,
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => {});
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};
