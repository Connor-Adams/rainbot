const { SlashCommandBuilder } = require('discord.js');
const voiceManager = require('../../utils/voiceManager');
const { createLogger } = require('../../utils/logger');

const log = createLogger('SKIP');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip the current track'),

    async execute(interaction) {
        const guildId = interaction.guildId;

        const status = voiceManager.getStatus(guildId);
        if (!status) {
            return interaction.reply({
                content: '❌ I\'m not in a voice channel!',
                ephemeral: true,
            });
        }

        if (!status.nowPlaying) {
            return interaction.reply({
                content: '❌ Nothing is playing right now.',
                ephemeral: true,
            });
        }

        try {
            const skipped = voiceManager.skip(guildId);
            log.info(`Skipped: "${skipped}" by ${interaction.user.tag}`);
            
            const queue = voiceManager.getQueue(guildId);
            const nextUp = queue.queue[0]?.title || 'Nothing';
            
            await interaction.reply(`⏭️ Skipped: **${skipped}**\nUp next: **${nextUp}**`);
        } catch (error) {
            log.error(`Skip error: ${error.message}`);
            await interaction.reply({
                content: `❌ ${error.message}`,
                ephemeral: true,
            });
        }
    },
};

