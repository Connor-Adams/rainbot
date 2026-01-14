const { Events } = require('discord.js');
const { createLogger } = require('../../dist/utils/logger');
const stats = require('../../dist/utils/statistics');

const log = createLogger('GUILD');

module.exports = {
  name: Events.GuildCreate,
  async execute(guild) {
    log.info(`Bot added to guild: ${guild.name} (${guild.id}) with ${guild.memberCount} members`);

    // Track guild join event
    stats.trackGuildEvent('bot_added', guild.id, guild.name, guild.memberCount, guild.ownerId, {
      region: guild.preferredLocale,
      boostLevel: guild.premiumTier,
      boostCount: guild.premiumSubscriptionCount,
      verificationLevel: guild.verificationLevel,
      features: guild.features,
    });
  },
};
