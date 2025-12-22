const { SlashCommandBuilder } = require('discord.js');
const voiceManager = require('../../utils/voiceManager');
const { createLogger } = require('../../utils/logger');

const log = createLogger('PAUSE');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Toggle pause/resume playback (pauses if playing, resumes if paused)'),

    async execute(interaction) {
        const guildId = interaction.guildId;

        const status = voiceManager.getStatus(guildId);
        if (!status) {
            return interaction.reply({
                content: '❌ I\'m not in a voice channel! Use `/join` to connect me to your voice channel first.',
                ephemeral: true,
            });
        }

        try {
            const result = voiceManager.togglePause(guildId);
            
            if (result.paused) {
                log.info(`Paused by ${interaction.user.tag}`);
                const { nowPlaying } = voiceManager.getQueue(guildId);
                const trackInfo = nowPlaying ? ` **${nowPlaying}**` : '';
                await interaction.reply(`⏸️ Paused playback${trackInfo}.`);
            } else {
                log.info(`Resumed by ${interaction.user.tag}`);
                const { nowPlaying } = voiceManager.getQueue(guildId);
                const trackInfo = nowPlaying ? ` **${nowPlaying}**` : '';
                await interaction.reply(`▶️ Resumed playback${trackInfo}.`);
            }
        } catch (error) {
            log.error(`Pause error: ${error.message}`);
            await interaction.reply({
                content: `❌ ${error.message}\n\n💡 **Tip:** Make sure something is playing before trying to pause.`,
                ephemeral: true,
            });
        }
    },
};

