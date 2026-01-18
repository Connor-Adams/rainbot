import { statsEmitter } from './config';
import { flushBatches, startBatchProcessor, stopBatchProcessor } from './batch';
import { activeSessions, activeUserSessions } from './store';
import { trackCommand } from './commands';
import { trackSound } from './sounds';
import { trackQueueOperation } from './queue';
import { trackVoiceEvent } from './voice';
import { trackSearch } from './search';
import {
  getActiveSession,
  incrementSessionTracks,
  startVoiceSession,
  endVoiceSession,
  updateSessionPeakUsers,
} from './voiceSessions';
import {
  endAllUserSessionsForGuild,
  endUserSession,
  getActiveUserCount,
  getActiveUserSession,
  getUsersInChannel,
  startUserSession,
  trackUserListen,
} from './userSessions';
import {
  endTrackEngagement,
  getActiveTrackEngagement,
  startTrackEngagement,
} from './trackEngagement';
import { trackInteraction } from './interactions';
import { trackPlaybackStateChange } from './playbackState';
import { trackWebEvent } from './webEvents';
import { trackGuildEvent } from './guildEvents';
import { trackApiLatency } from './apiLatency';

export { statsEmitter };

export {
  trackCommand,
  trackSound,
  trackQueueOperation,
  trackVoiceEvent,
  trackSearch,
  startVoiceSession,
  endVoiceSession,
  incrementSessionTracks,
  updateSessionPeakUsers,
  getActiveSession,
  startUserSession,
  endUserSession,
  trackUserListen,
  getUsersInChannel,
  getActiveUserSession,
  getActiveUserCount,
  endAllUserSessionsForGuild,
  startTrackEngagement,
  endTrackEngagement,
  getActiveTrackEngagement,
  trackInteraction,
  trackPlaybackStateChange,
  trackWebEvent,
  trackGuildEvent,
  trackApiLatency,
  startBatchProcessor,
  flushBatches,
};

/**
 * Flush all pending events (useful for graceful shutdown)
 */
export async function flushAll(): Promise<void> {
  const userSessionEntries = Array.from(activeUserSessions.entries());
  for (const [key, session] of userSessionEntries) {
    const parts = key.split(':');
    const guildId = parts[0] || '';
    const channelId = parts[1] || '';
    await endUserSession(session.userId, guildId, channelId);
  }

  const activeGuildIds = Array.from(activeSessions.keys());
  for (const guildId of activeGuildIds) {
    await endVoiceSession(guildId);
  }

  await flushBatches();
  stopBatchProcessor();
  try {
    statsEmitter.emit('flushed', { ts: new Date().toISOString() });
  } catch {
    /* ignore */
  }
}
