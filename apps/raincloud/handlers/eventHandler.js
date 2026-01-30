const fs = require('fs');
const path = require('path');
const { createLogger } = require('../dist/utils/logger');

const log = createLogger('EVENTS');

module.exports = (client) => {
  const distEventsPath = path.join(__dirname, '..', 'dist', 'src', 'events');
  const srcEventsPath = path.join(__dirname, '..', 'src', 'events');
  const eventsPath = fs.existsSync(distEventsPath) ? distEventsPath : srcEventsPath;
  const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith('.js'));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);

    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
    } else {
      client.on(event.name, (...args) => event.execute(...args));
    }

    log.info(`Loaded: ${event.name}`);
  }
};
