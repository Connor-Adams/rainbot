// util-category: audio
import { createLogger } from '../logger';
import { getClient } from '../../server/client';
import { detectSourceType } from '../sourceType';
import * as stats from '../statistics';
import * as listeningHistory from '../listeningHistory';
import type { Track } from '@rainbot/protocol';
import type { VoiceState } from '@rainbot/protocol';
import type { VoiceChannel, TextChannel } from 'discord.js';
import { getPlaybackPosition } from './PlaybackTiming';

const log = createLogger('PLAYBACK_EFFECTS');

export async function sendNowPlaying(
  guildId: string,
  state: VoiceState,
  track: Track
): Promise<void> {
  try {
    const client = getClient();
    if (!client) return;

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const channel = guild.channels.cache.get(state.channelId) as
      | VoiceChannel
      | TextChannel
      | undefined;

    if (!channel || !('send' in channel)) return;

    let duration = '';
    if (track.duration) {
      const m = Math.floor(track.duration / 60);
      const s = track.duration % 60;
      duration = ` (${m}:${s.toString().padStart(2, '0')})`;
    }

    await channel.send(`🎵 Now playing: **${track.title}**${duration}`);
  } catch (err) {
    log.debug(`Now playing failed: ${(err as Error).message}`);
  }
}

export function trackTrackStart(guildId: string, state: VoiceState, track: Track): void {
  if (track.isSoundboard) return;

  const sourceType = detectSourceType(track);
  const userId = track.userId || state.lastUserId;
  const username = track.username || state.lastUsername;
  const discriminator = track.discriminator || state.lastDiscriminator;

  if (!userId) return;

  stats.trackSound(
    track.title,
    userId,
    guildId,
    sourceType,
    false,
    track.duration || null,
    track.source || 'discord',
    username,
    discriminator
  );

  listeningHistory
    .trackPlayed(
      userId,
      guildId,
      {
        title: track.title,
        url: track.url,
        duration: track.duration,
        isLocal: track.isLocal,
        isSoundboard: false,
        source: track.source || 'discord',
      },
      userId
    )
    .catch((err) => log.error(`Listening history failed: ${(err as Error).message}`));

  stats.trackUserListen(
    guildId,
    state.channelId,
    track.title,
    track.url || null,
    sourceType,
    track.duration || null,
    userId
  );

  stats.startTrackEngagement(
    guildId,
    state.channelId,
    track.title,
    track.url || null,
    sourceType,
    track.duration || null,
    userId
  );

  stats.incrementSessionTracks(guildId);
}

export function trackPlaybackStateChange(
  guildId: string,
  state: VoiceState,
  action: 'pause' | 'resume' | 'volume',
  from: string,
  to: string,
  userId?: string | null,
  username?: string | null
): void {
  stats.trackPlaybackStateChange(
    guildId,
    state.channelId,
    action,
    from,
    to,
    userId || null,
    username || null,
    state.nowPlaying,
    getPlaybackPosition(state),
    'discord'
  );
}
