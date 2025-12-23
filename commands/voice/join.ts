// Note: join command needs Discord.js VoiceChannel object which can't be easily typed
// Most logic stays in JS, but we can provide helper functions if needed

export interface JoinValidationResult {
  valid: boolean;
  error?: string;
  missingPerms?: string[];
}

export function validateJoinPermissions(
  hasConnect: boolean,
  hasSpeak: boolean,
  channelName: string
): JoinValidationResult {
  const missingPerms: string[] = [];
  if (!hasConnect) missingPerms.push('Connect');
  if (!hasSpeak) missingPerms.push('Speak');
  
  if (missingPerms.length > 0) {
    return {
      valid: false,
      error: `❌ I need the following permissions in **${channelName}**: ${missingPerms.join(', ')}\n\n💡 Ask a server administrator to grant these permissions.`,
      missingPerms,
    };
  }
  
  return { valid: true };
}

export function formatJoinSuccessMessage(channelName: string): string {
  return `🔊 Joined **${channelName}**! Use \`/play\` to start playing music.`;
}

export function formatJoinErrorMessage(error: Error): string {
  return `❌ Failed to join the voice channel: ${error.message}\n\n💡 Make sure I have the necessary permissions and try again.`;
}

