import type { Client } from 'discord.js';
import { createLogger } from '@rainbot/utils';

const log = createLogger('ROLE_VERIFIER');

/**
 * Verify if a user has the required role in any guild where the bot is present
 * @param userId - Discord user ID
 * @param requiredRoleId - Discord role ID that user must have
 * @param botClient - Discord bot client instance
 * @returns True if user has the role in at least one guild
 */
export async function verifyUserRole(
  userId: string,
  requiredRoleId: string,
  botClient: Client | null
): Promise<boolean> {
  if (!botClient || !botClient.isReady()) {
    log.warn('Bot client not ready for role verification');
    return false;
  }

  if (!userId || !requiredRoleId) {
    log.warn('Missing userId or requiredRoleId for verification');
    return false;
  }

  try {
    const botGuilds = botClient.guilds.cache;

    // Check each guild where the bot is present
    for (const [guildId, guild] of botGuilds) {
      try {
        // Fetch the member (this may require API call)
        const member = await guild.members.fetch(userId).catch(() => null);

        if (!member) {
          // User is not a member of this guild, continue to next
          continue;
        }

        // Check if member has the required role
        if (member.roles.cache.has(requiredRoleId)) {
          log.debug(`User ${userId} has required role ${requiredRoleId} in guild ${guild.name}`);
          return true;
        }
      } catch (error) {
        // If fetching member fails (e.g., user not in guild), continue to next guild
        const err = error as Error;
        log.debug(`Could not fetch member ${userId} in guild ${guildId}: ${err.message}`);
        continue;
      }
    }

    log.debug(`User ${userId} does not have required role ${requiredRoleId} in any bot guild`);
    return false;
  } catch (error) {
    const err = error as Error;
    log.error(`Error verifying user role: ${err.message}`);
    return false;
  }
}
