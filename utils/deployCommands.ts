import { REST, Routes, RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { createLogger } from './logger';

const log = createLogger('DEPLOY');

interface Command {
  data: {
    name: string;
    toJSON: () => RESTPostAPIChatInputApplicationCommandsJSONBody;
  };
  execute: (...args: unknown[]) => Promise<void>;
}

/**
 * Load all commands from the commands directory
 */
export function loadCommands(): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  const commands: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [];
  const commandsPath = path.join(__dirname, '..', 'commands');
  const commandFolders = fs.readdirSync(commandsPath);

  for (const folder of commandFolders) {
    const folderPath = path.join(commandsPath, folder);

    if (!fs.statSync(folderPath).isDirectory()) continue;

    const commandFiles = fs.readdirSync(folderPath).filter((file) => file.endsWith('.js'));

    for (const file of commandFiles) {
      const filePath = path.join(folderPath, file);

      const command = require(filePath) as Partial<Command>;

      if ('data' in command && command.data && 'execute' in command) {
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
 */
export async function deployCommands(
  token: string,
  clientId: string,
  guildId: string | null = null
): Promise<RESTPostAPIChatInputApplicationCommandsJSONBody[] | undefined> {
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

    let data: RESTPostAPIChatInputApplicationCommandsJSONBody[];
    if (guildId) {
      // Deploy to a specific guild (faster for development, updates immediately)
      data = (await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commands,
      })) as RESTPostAPIChatInputApplicationCommandsJSONBody[];
    } else {
      // Deploy globally (takes up to 1 hour to propagate)
      data = (await rest.put(Routes.applicationCommands(clientId), {
        body: commands,
      })) as RESTPostAPIChatInputApplicationCommandsJSONBody[];
    }

    log.info(
      `Successfully reloaded ${data.length} application (/) commands${guildId ? ` for guild ${guildId}` : ' globally'}.`
    );
    return data;
  } catch (error) {
    const err = error as Error;
    log.error(`Failed to deploy commands: ${err.message}`);
    throw error;
  }
}
