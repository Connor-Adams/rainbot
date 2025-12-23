const { SlashCommandBuilder } = require('discord.js');
const voiceManager = require('../../utils/voiceManager');
const { createLogger } = require('../../utils/logger');

const log = createLogger('SKIP');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip the current track or multiple tracks from the queue')
        .addIntegerOption(option =>
            option
                .setName('count')
                .setDescription('Number of tracks to skip (default: 1)')
                .setMinValue(1)
                .setMaxValue(10)
        ),

    async execute(interaction) {
        const guildId = interaction.guildId;
        const count = interaction.options.getInteger('count') || 1;

        const status = voiceManager.getStatus(guildId);
        if (!status) {
            return interaction.reply({
                content: '❌ I\'m not in a voice channel! Use `/join` to connect me to your voice channel first.',
                ephemeral: true,
            });
        }

        try {
            const skipped = voiceManager.skip(guildId, count);
            
            if (skipped.length === 0) {
                return interaction.reply({
                    content: '❌ Nothing is playing right now.',
                    ephemeral: true,
                });
            }

            log.info(`Skipped ${skipped.length} track(s) by ${interaction.user.tag}`);
            
            const queue = voiceManager.getQueue(guildId);
            const nextUp = queue.queue[0]?.title || 'Nothing';
            
            let replyText = '';
            if (skipped.length === 1) {
                replyText = `⏭️ Skipped: **${skipped[0]}**`;
            } else {
                replyText = `⏭️ Skipped **${skipped.length}** tracks:\n${skipped.map((t, i) => `${i + 1}. ${t}`).join('\n')}`;
            }
            
            replyText += `\n\n▶️ Up next: **${nextUp}**`;
            
            await interaction.reply(replyText);
        } catch (error) {
            log.error(`Skip error: ${error.message}`);
            await interaction.reply({
                content: `❌ ${error.message}`,
                ephemeral: true,
            });
        }
    },
};

