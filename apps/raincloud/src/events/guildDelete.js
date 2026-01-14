const { Events } = require('discord.js');
const { createLogger } = require('../../dist/utils/logger');
const stats = require('../../dist/utils/statistics');

const log = createLogger('GUILD');

module.exports = {
  name: Events.GuildDelete,
  async execute(guild) {
    // Guild might be unavailable (e.g., Discord outage) - guild.available will be false
    if (!guild.available) {
      log.warn(`Guild ${guild.id} became unavailable (possibly Discord outage)`);
      return;
    }

    log.info(`Bot removed from guild: ${guild.name} (${guild.id})`);

    // Track guild leave event
    stats.trackGuildEvent('bot_removed', guild.id, guild.name, guild.memberCount, null, {
      wasKicked: true,
    });
  },
};
