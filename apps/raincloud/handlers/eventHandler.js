const fs = require('fs');
const path = require('path');
const { createLogger } = require('../dist/utils/logger');

const log = createLogger('EVENTS');

module.exports = (client) => {
  const distEventsPath = path.join(__dirname, '..', 'dist', 'src', 'events');
  const srcEventsPath = path.join(__dirname, '..', 'src', 'events');
  const eventFiles = new Map();

  // Prefer compiled events when available.
  if (fs.existsSync(distEventsPath)) {
    for (const file of fs.readdirSync(distEventsPath).filter((name) => name.endsWith('.js'))) {
      eventFiles.set(file, path.join(distEventsPath, file));
    }
  }

  // Fall back to source events for any files not compiled to dist.
  if (fs.existsSync(srcEventsPath)) {
    for (const file of fs.readdirSync(srcEventsPath).filter((name) => name.endsWith('.js'))) {
      if (!eventFiles.has(file)) {
        eventFiles.set(file, path.join(srcEventsPath, file));
      }
    }
  }

  for (const filePath of eventFiles.values()) {
    const event = require(filePath);

    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
    } else {
      client.on(event.name, (...args) => event.execute(...args));
    }

    log.info(`Loaded: ${event.name}`);
  }
};
