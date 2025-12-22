const { SlashCommandBuilder } = require('discord.js');
const voiceManager = require('../../utils/voiceManager');
const { createLogger } = require('../../utils/logger');

const log = createLogger('CLEAR');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Clear the music queue (keeps current track playing)'),

    async execute(interaction) {
        const guildId = interaction.guildId;

        const status = voiceManager.getStatus(guildId);
        if (!status) {
            return interaction.reply({
                content: '❌ I\'m not in a voice channel!',
                ephemeral: true,
            });
        }

        try {
            const cleared = voiceManager.clearQueue(guildId);
            log.info(`Cleared ${cleared} tracks by ${interaction.user.tag}`);
            
            if (cleared === 0) {
                await interaction.reply('📋 Queue was already empty.');
            } else {
                await interaction.reply(`🗑️ Cleared **${cleared}** tracks from the queue.`);
            }
        } catch (error) {
            log.error(`Clear error: ${error.message}`);
            await interaction.reply({
                content: `❌ ${error.message}`,
                ephemeral: true,
            });
        }
    },
};

