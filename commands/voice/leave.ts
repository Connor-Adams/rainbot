import type { LeaveResult } from '../../types/commands';

const voiceManager = require('../../utils/voiceManager');

export interface LeaveExecuteResult {
  success: boolean;
  error?: string;
  channelName?: string;
}

export function executeLeave(guildId: string): LeaveExecuteResult {
  const status = voiceManager.getStatus(guildId);
  if (!status) {
    return {
      success: false,
      error:
        "❌ I'm not in a voice channel! Use `/join` to connect me to your voice channel first.",
    };
  }

  try {
    const channelName = status.channelName;
    voiceManager.leaveChannel(guildId);
    return {
      success: true,
      channelName: channelName || undefined,
    };
  } catch (error: any) {
    return {
      success: false,
      error: `❌ Failed to leave the voice channel: ${error.message}`,
    };
  }
}

export function formatLeaveMessage(channelName?: string): string {
  if (channelName) {
    return `👋 Left **${channelName}**! The queue has been cleared.`;
  }
  return '👋 Left the voice channel! The queue has been cleared.';
}
