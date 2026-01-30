// util-category: audio
import * as stats from '../statistics';
import * as listeningHistory from '../listeningHistory';
import { createLogger } from '../logger';
import type { QueueState } from '@rainbot/types/media';
import type { Track } from '@rainbot/types/voice';

const log = createLogger('VOICE_EVENTS');

export interface VoiceEventContext {
  guildId: string;
  userId?: string;
  username?: string;
  discriminator?: string;
  source: string;
}

/* ============================================================================
 * QUEUE / PLAYBACK EVENTS
 * ============================================================================
 */

export function onQueueAdd(ctx: VoiceEventContext, meta: { added: number }) {
  if (!ctx.userId) return;

  stats.trackQueueOperation('add', ctx.userId, ctx.guildId, ctx.source, meta);
}

export function onSkip(ctx: VoiceEventContext, meta: { count: number; skipped: number }) {
  if (!ctx.userId) return;

  stats.trackQueueOperation('skip', ctx.userId, ctx.guildId, ctx.source, meta);
}

export function onRemove(ctx: VoiceEventContext, meta: { index: number; title: string }) {
  if (!ctx.userId) return;

  stats.trackQueueOperation('remove', ctx.userId, ctx.guildId, ctx.source, meta);
}

export function onClear(ctx: VoiceEventContext, meta: { cleared: number }) {
  if (!ctx.userId) return;

  stats.trackQueueOperation('clear', ctx.userId, ctx.guildId, ctx.source, meta);
}

export function onPauseToggle(ctx: VoiceEventContext, paused: boolean) {
  if (!ctx.userId) return;

  stats.trackQueueOperation(paused ? 'pause' : 'resume', ctx.userId, ctx.guildId, ctx.source);
}

/* ============================================================================
 * HISTORY EVENTS
 * ============================================================================
 */

export function saveUserHistory(
  ctx: VoiceEventContext,
  queueState: QueueState,
  currentTrack: Track | null
) {
  if (!ctx.userId) return;

  listeningHistory.saveHistory(
    ctx.userId,
    ctx.guildId,
    queueState.queue,
    queueState.nowPlaying?.title ?? null,
    currentTrack
  );
}

export function trackSoundboard(ctx: VoiceEventContext, soundName: string) {
  if (!ctx.userId) return;

  stats.trackSound(
    soundName,
    ctx.userId,
    ctx.guildId,
    'local',
    true,
    null,
    ctx.source,
    ctx.username ?? null,
    ctx.discriminator ?? null
  );

  listeningHistory
    .trackPlayed(
      ctx.userId,
      ctx.guildId,
      {
        title: soundName,
        isLocal: true,
        isSoundboard: true,
        source: ctx.source,
      },
      ctx.userId
    )
    .catch((err: Error) => log.error(`Failed to track soundboard history: ${err.message}`));
}
