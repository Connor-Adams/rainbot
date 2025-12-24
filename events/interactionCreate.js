const { Events } = require('discord.js');
const { createLogger } = require('../dist/utils/logger');
const voiceManager = require('../dist/utils/voiceManager');
const stats = require('../dist/utils/statistics');

const log = createLogger('INTERACTION');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    // Handle autocomplete interactions
    if (interaction.isAutocomplete()) {
      const command = interaction.client.commands.get(interaction.commandName);

      if (!command) {
        return;
      }

      // Handle autocomplete for /play command's source option
      if (interaction.commandName === 'play') {
        const focusedOption = interaction.options.getFocused(true);

        if (focusedOption.name === 'source') {
          try {
            const sounds = await voiceManager.listSounds();
            const input = focusedOption.value.toLowerCase().trim();

            let filtered;
            if (input === '') {
              // Show all sounds if no input (up to 25)
              filtered = sounds.slice(0, 25);
            } else {
              // Filter sounds that match the input
              filtered = sounds.filter((sound) => sound.name.toLowerCase().includes(input));
            }

            // Limit to 25 choices (Discord's limit)
            const choices = filtered.slice(0, 25).map((sound) => ({
              name: sound.name.length > 100 ? sound.name.substring(0, 97) + '...' : sound.name,
              value: sound.name,
            }));

            await interaction.respond(choices);
          } catch (error) {
            log.error(`Error in autocomplete: ${error.message}`);
            // Return empty array on error - user can still type and search
            await interaction.respond([]);
          }
        }
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
      log.warn(`No command matching: ${interaction.commandName}`);
      return;
    }

    try {
      await command.execute(interaction);
      log.debug(`Executed: ${interaction.commandName} by ${interaction.user.tag}`);

      // Track successful command execution
      stats.trackCommand(
        interaction.commandName,
        interaction.user.id,
        interaction.guildId,
        'discord',
        true,
        null,
        interaction.user.username,
        interaction.user.discriminator
      );
    } catch (error) {
      log.error(`Error executing ${interaction.commandName}: ${error.message}`, {
        stack: error.stack,
      });

      // Track failed command execution
      stats.trackCommand(
        interaction.commandName,
        interaction.user.id,
        interaction.guildId,
        'discord',
        false,
        error.message,
        interaction.user.username,
        interaction.user.discriminator
      );

      const reply = {
        content: 'There was an error while executing this command!',
        ephemeral: true,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    }
  },
};
