const fs = require('fs');
const path = require('path');
const { createLogger } = require('@rainbot/utils/logger');

const log = createLogger('EVENTS');

// tsconfig.json compiles with rootDir = repo root, so apps/raincloud/src/events/*.ts
// lands in dist/apps/raincloud/src/events — not dist/src/events.
const DIST_EVENTS_PATH = path.join(__dirname, '..', 'dist', 'apps', 'raincloud', 'src', 'events');
const SRC_EVENTS_PATH = path.join(__dirname, '..', 'src', 'events');

/**
 * Collect event modules by filename, preferring compiled output over source so a
 * TypeScript event isn't silently skipped (its .ts file is not requireable).
 */
function collectEventFiles(dirs) {
  const eventFiles = new Map();

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.js'))) {
      if (!eventFiles.has(file)) {
        eventFiles.set(file, path.join(dir, file));
      }
    }
  }

  return eventFiles;
}

module.exports = (client, options = {}) => {
  const dirs = options.eventDirs || [DIST_EVENTS_PATH, SRC_EVENTS_PATH];
  const eventFiles = collectEventFiles(dirs);

  for (const filePath of eventFiles.values()) {
    const required = require(filePath);
    // Compiled TS events use `export default`, plain JS events use module.exports.
    const event = required && required.default ? required.default : required;

    if (!event || typeof event.name !== 'string' || typeof event.execute !== 'function') {
      log.warn(`Skipped ${path.basename(filePath)}: not a valid event module`);
      continue;
    }

    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
    } else {
      client.on(event.name, (...args) => event.execute(...args));
    }

    log.info(`Loaded: ${event.name}`);
  }
};

module.exports.collectEventFiles = collectEventFiles;
module.exports.DIST_EVENTS_PATH = DIST_EVENTS_PATH;
module.exports.SRC_EVENTS_PATH = SRC_EVENTS_PATH;
