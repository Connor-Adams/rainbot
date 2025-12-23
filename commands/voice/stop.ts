import type { StopResult } from '../../types/voice';

const voiceManager = require('../../utils/voiceManager');

export function executeStop(guildId: string): StopResult {
  const success = voiceManager.stopSound(guildId);
  return { success, cleared: 0 };
}
