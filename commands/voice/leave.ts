import type { LeaveResult } from '../../types/voice';

const voiceManager = require('../../utils/voiceManager');

export function executeLeave(guildId: string): LeaveResult {
  const success = voiceManager.leaveChannel(guildId);
  return { success, guildId };
}
