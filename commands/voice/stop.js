const { SlashCommandBuilder } = require('discord.js');
const voiceManager = require('../../utils/voiceManager');
const { createLogger } = require('../../utils/logger');

const log = createLogger('STOP');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop playback and clear the queue'),

    async execute(interaction) {
        const guildId = interaction.guildId;

        const status = voiceManager.getStatus(guildId);
        if (!status) {
            return interaction.reply({
                content: '❌ I\'m not in a voice channel!',
                ephemeral: true,
            });
        }

        const stopped = voiceManager.stopSound(guildId);
        
        if (stopped) {
            log.info(`Stopped by ${interaction.user.tag}`);
            await interaction.reply('⏹️ Stopped playback and cleared the queue.');
        } else {
            await interaction.reply({
                content: '❌ Nothing is playing.',
                ephemeral: true,
            });
        }
    },
};

