const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { createLogger } = require('./logger');

const log = createLogger('DEPLOY');

/**
 * Load all commands from the commands directory
 */
function loadCommands() {
  const commands = [];
  const commandsPath = path.join(__dirname, '..', 'commands');
  const commandFolders = fs.readdirSync(commandsPath);

  for (const folder of commandFolders) {
    const folderPath = path.join(commandsPath, folder);

    if (!fs.statSync(folderPath).isDirectory()) continue;

    const commandFiles = fs.readdirSync(folderPath).filter((file) => file.endsWith('.js'));

    for (const file of commandFiles) {
      const filePath = path.join(folderPath, file);
      const command = require(filePath);

      if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
        log.debug(`Loaded command: ${command.data.name}`);
      } else {
        log.warn(`The command at ${filePath} is missing a required "data" or "execute" property.`);
      }
    }
  }

  return commands;
}

/**
 * Deploy commands to Discord
 * @param {string} token - Bot token
 * @param {string} clientId - Bot client ID
 * @param {string} guildId - Guild ID (optional, if provided deploys to guild, otherwise global)
 */
async function deployCommands(token, clientId, guildId = null) {
  try {
    const commands = loadCommands();

    if (commands.length === 0) {
      log.warn('No commands found to deploy');
      return;
    }

    const rest = new REST().setToken(token);

    log.info(
      `Started refreshing ${commands.length} application (/) commands${guildId ? ` for guild ${guildId}` : ' globally'}...`
    );

    let data;
    if (guildId) {
      // Deploy to a specific guild (faster for development, updates immediately)
      data = await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    } else {
      // Deploy globally (takes up to 1 hour to propagate)
      data = await rest.put(Routes.applicationCommands(clientId), { body: commands });
    }

    log.info(
      `Successfully reloaded ${data.length} application (/) commands${guildId ? ` for guild ${guildId}` : ' globally'}.`
    );
    return data;
  } catch (error) {
    log.error(`Failed to deploy commands: ${error.message}`);
    throw error;
  }
}

module.exports = {
  deployCommands,
  loadCommands,
};
