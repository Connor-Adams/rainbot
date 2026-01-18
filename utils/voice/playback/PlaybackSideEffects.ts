// util-category: audio
import { createLogger } from '@utils/logger';
import { getClient } from '../../../apps/raincloud/server/client';
import { detectSourceType } from '@utils/sourceType';
import * as stats from '@utils/statistics';
import * as listeningHistory from '@utils/listeningHistory';
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
  const userId = track.userId || state.lastUserId || 'unknown';
  const username = track.username || state.lastUsername || 'unknown';
  const discriminator = track.discriminator || state.lastDiscriminator || '0000';

  if (!userId || userId === 'unknown') return;

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
        url: track.url || '',
        duration: track.duration || 0,
        isLocal: track.isLocal || false,
        isSoundboard: false,
        source: track.source || 'discord',
      },
      userId
    )
    .catch((err: unknown) => log.error(`Listening history failed: ${(err as Error).message}`));

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
    state.nowPlaying || null,
    getPlaybackPosition(state),
    'discord'
  );
}
