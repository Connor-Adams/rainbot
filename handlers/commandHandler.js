const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');
const { createLogger } = require('../utils/logger');

const log = createLogger('COMMANDS');

module.exports = (client) => {
  client.commands = new Collection();

  const commandsPath = path.join(__dirname, '..', 'commands');
  const commandFolders = fs.readdirSync(commandsPath);

  for (const folder of commandFolders) {
    const folderPath = path.join(commandsPath, folder);

    // Skip if not a directory
    if (!fs.statSync(folderPath).isDirectory()) continue;

    const commandFiles = fs.readdirSync(folderPath).filter((file) => file.endsWith('.js'));

    for (const file of commandFiles) {
      const filePath = path.join(folderPath, file);
      const command = require(filePath);

      if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        log.info(`Loaded: ${command.data.name}`);
      } else {
        log.warn(`Missing "data" or "execute" property: ${filePath}`);
      }
    }
  }
};
