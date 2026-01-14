// util-category: audio
import { createAudioResource, AudioPlayerStatus, StreamType } from '@discordjs/voice';
import type { VoiceBasedChannel } from 'discord.js';

import * as connectionManager from './voice/connectionManager';
import * as queueManager from './voice/queueManager';
import * as playbackManager from './voice/playbackManager';
import * as trackFetcher from './voice/trackFetcher';
import * as snapshotPersistence from './voice/snapshotPersistence';
import * as soundboardManager from './voice/soundboardManager';
import * as voiceState from './voice/voiceState';
import * as voiceEvents from './voice/voiceEvents';

import { createLogger } from './logger';
import * as stats from './statistics';
import * as storage from './storage';
import type { Track, QueueInfo, VoiceStatus } from '@rainbot/protocol';

const log = createLogger('VOICE');

export const getVoiceState = connectionManager.getVoiceState;

/* ============================================================================
 * CONTEXT
 * ============================================================================
 */

interface VoiceActionContext {
  guildId: string;
  userId?: string;
  username?: string;
  discriminator?: string;
  source: string;
}

function resolveContext(guildId: string, partial: Partial<VoiceActionContext>): VoiceActionContext {
  const state = connectionManager.getVoiceState(guildId);

  return {
    guildId,
    source: partial.source ?? 'discord',
    userId: partial.userId ?? state?.lastUserId ?? undefined,
    username: partial.username ?? state?.lastUsername ?? undefined,
    discriminator: partial.discriminator ?? state?.lastDiscriminator ?? undefined,
  };
}

/* ============================================================================
 * SOUNDBOARD POLICY
 * ============================================================================
 */

type SoundboardPlaybackDecision = { type: 'overlay' } | { type: 'immediate' };

function decideSoundboardPlayback(
  state: NonNullable<ReturnType<typeof getVoiceState>>
): SoundboardPlaybackDecision {
  return state.currentTrackSource ? { type: 'overlay' } : { type: 'immediate' };
}

async function handleSoundboardTrack(guildId: string, track: Track, ctx: VoiceActionContext) {
  const state = connectionManager.getVoiceState(guildId);
  if (!state) throw new Error('Bot is not connected to a voice channel');

  const decision = decideSoundboardPlayback(state);

  if (decision.type === 'overlay') {
    try {
      const result = await soundboardManager.playSoundboardOverlay(
        state,
        guildId,
        track.title,
        ctx.userId ?? '',
        ctx.source,
        ctx.username ?? null,
        ctx.discriminator ?? null
      );

      return {
        added: 1,
        tracks: [{ title: track.title, isLocal: true }],
        totalInQueue: state.queue.length,
        overlaid: result.overlaid,
      };
    } catch (err) {
      log.warn(`Overlay failed, falling back to immediate playback: ${(err as Error).message}`);
    }
  }

  const stream = await storage.getSoundStream(track.title);
  const resource = createAudioResource(stream, { inputType: StreamType.Arbitrary });

  playbackManager.playSoundImmediate(guildId, resource, track.title);
  voiceEvents.trackSoundboard(ctx, track.title);

  return {
    added: 1,
    tracks: [{ title: track.title, isLocal: true }],
    totalInQueue: state.queue.length,
    overlaid: false,
  };
}

/* ============================================================================
 * PUBLIC API
 * ============================================================================
 */

export async function joinChannel(channel: VoiceBasedChannel) {
  const result = await connectionManager.joinChannel(channel);

  stats.trackVoiceEvent('join', channel.guild.id, channel.id, channel.name, 'discord');
  stats.startVoiceSession(channel.guild.id, channel.id, channel.name, 'discord');

  for (const [, member] of channel.members) {
    if (!member.user.bot) {
      stats.startUserSession(
        member.id,
        channel.guild.id,
        channel.id,
        channel.name,
        member.user.username,
        member.user.discriminator
      );
    }
  }

  return result;
}

export function leaveChannel(guildId: string): boolean {
  const state = connectionManager.getVoiceState(guildId);

  if (state && (state.currentTrack || state.queue.length > 0)) {
    snapshotPersistence.saveQueueSnapshot(guildId).catch(() => {});
  }

  if (state?.lastUserId) {
    voiceEvents.saveUserHistory(
      { guildId, userId: state.lastUserId, source: 'discord' },
      getQueue(guildId),
      state.currentTrack || null
    );
  }

  voiceState.clearLastActor(guildId);

  const result = connectionManager.leaveChannel(guildId);
  if (result && state?.channelId) {
    stats.trackVoiceEvent('leave', guildId, state.channelId, state.channelName, 'discord');
  }

  stats.endVoiceSession(guildId).catch(() => {});
  return result;
}

export async function playSound(
  guildId: string,
  source: string,
  userId: string | null = null,
  requestSource = 'discord',
  username: string | null = null,
  discriminator: string | null = null
) {
  const state = connectionManager.getVoiceState(guildId);
  if (!state) throw new Error('Bot is not connected');

  const ctx = resolveContext(guildId, {
    userId: userId ?? undefined,
    username: username ?? undefined,
    discriminator: discriminator ?? undefined,
    source: requestSource,
  });

  const tracks = await trackFetcher.fetchTracks(source, guildId);

  if (tracks.length === 1 && tracks[0].isLocal && tracks[0].isSoundboard) {
    return handleSoundboardTrack(guildId, tracks[0], ctx);
  }

  if (ctx.userId) {
    voiceState.setLastActor(guildId, {
      userId: ctx.userId,
      username: ctx.username,
      discriminator: ctx.discriminator,
    });
  }

  for (const track of tracks) {
    track.userId ??= ctx.userId;
    track.username ??= ctx.username;
    track.discriminator ??= ctx.discriminator;
    track.source ??= ctx.source;
  }

  const result = await queueManager.addToQueue(guildId, tracks);

  if (state.player.state.status !== AudioPlayerStatus.Playing) {
    await playbackManager.playNext(guildId);
  }

  if (ctx.userId) {
    voiceEvents.saveUserHistory(ctx, getQueue(guildId), state.currentTrack);
    voiceEvents.onQueueAdd(ctx, { added: result.added });
  }

  return {
    added: result.added,
    tracks: result.tracks.slice(0, 5),
    totalInQueue: state.queue.length,
  };
}

/* ============================================================================
 * SMALL COMMANDS
 * ============================================================================
 */

export async function skip(guildId: string, count = 1, skippedBy: string | null = null) {
  const ctx = resolveContext(guildId, { userId: skippedBy ?? undefined });
  const result = await queueManager.skip(guildId, count, ctx.userId ?? null);

  voiceEvents.onSkip(ctx, { count, skipped: result.length });
  return result;
}

export function togglePause(
  guildId: string,
  userId: string | null = null,
  username: string | null = null
) {
  const ctx = resolveContext(guildId, {
    userId: userId ?? undefined,
    username: username ?? undefined,
  });

  const result = playbackManager.togglePause(guildId, ctx.userId ?? null, ctx.username ?? null);
  voiceEvents.onPauseToggle(ctx, result.paused);

  return result;
}

export async function clearQueue(guildId: string, userId: string | null = null) {
  const ctx = resolveContext(guildId, { userId: userId ?? undefined });
  const cleared = await queueManager.clearQueue(guildId, ctx.userId ?? null);

  voiceEvents.onClear(ctx, { cleared });
  return cleared;
}

export function setVolume(
  guildId: string,
  level: number,
  userId: string | null = null,
  username: string | null = null
) {
  const ctx = resolveContext(guildId, {
    userId: userId ?? undefined,
    username: username ?? undefined,
  });

  return playbackManager.setVolume(guildId, level, ctx.userId ?? null, ctx.username ?? null);
}

/* ============================================================================
 * READ ONLY
 * ============================================================================
 */

export function getQueue(guildId: string): QueueInfo {
  return queueManager.getQueue(guildId);
}

export function getStatus(guildId: string): VoiceStatus | null {
  const state = connectionManager.getVoiceState(guildId);
  if (!state) return null;

  return {
    channelId: state.channelId,
    channelName: state.channelName,
    nowPlaying: state.nowPlaying,
    isPlaying: state.player.state.status === AudioPlayerStatus.Playing,
    queueLength: state.queue.length,
    canReplay: !!state.lastPlayedTrack,
    lastPlayedTitle: state.lastPlayedTrack?.title || null,
    autoplay: state.autoplay,
  };
}
