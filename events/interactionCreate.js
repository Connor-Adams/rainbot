const { Events } = require('discord.js');
const { createLogger } = require('../utils/logger');

const log = createLogger('INTERACTION');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        if (!interaction.isChatInputCommand()) return;

        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) {
            log.warn(`No command matching: ${interaction.commandName}`);
            return;
        }

        try {
            await command.execute(interaction);
            log.debug(`Executed: ${interaction.commandName} by ${interaction.user.tag}`);
        } catch (error) {
            log.error(`Error executing ${interaction.commandName}: ${error.message}`, { stack: error.stack });

            const reply = { content: 'There was an error while executing this command!', ephemeral: true };

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(reply);
            } else {
                await interaction.reply(reply);
            }
        }
    },
};
