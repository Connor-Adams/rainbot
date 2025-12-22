const { SlashCommandBuilder } = require('discord.js');
const voiceManager = require('../../utils/voiceManager');
const { createLogger } = require('../../utils/logger');

const log = createLogger('PAUSE');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pause or resume playback'),

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
            const result = voiceManager.togglePause(guildId);
            
            if (result.paused) {
                log.info(`Paused by ${interaction.user.tag}`);
                await interaction.reply('⏸️ Paused playback.');
            } else {
                log.info(`Resumed by ${interaction.user.tag}`);
                await interaction.reply('▶️ Resumed playback.');
            }
        } catch (error) {
            await interaction.reply({
                content: `❌ ${error.message}`,
                ephemeral: true,
            });
        }
    },
};

