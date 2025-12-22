const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createLogger } = require('../utils/logger');
const listeningHistory = require('../utils/listeningHistory');

const log = createLogger('VOICE_STATE');

// Lazy load voiceManager to avoid circular dependency
let voiceManager = null;
function getVoiceManager() {
    if (!voiceManager) {
        voiceManager = require('../utils/voiceManager');
    }
    return voiceManager;
}

module.exports = {
    name: Events.VoiceStateUpdate,
    async execute(oldState, newState) {
        // Only process if user joined a voice channel (wasn't in one, now is)
        if (oldState.channelId === newState.channelId) return;
        if (!newState.channelId) return; // User left voice

        const userId = newState.member?.id;
        const guildId = newState.guild?.id;
        const channelId = newState.channelId;

        if (!userId || !guildId) return;

        // Check if bot is in the same voice channel
        const vm = getVoiceManager();
        const botStatus = vm.getStatus(guildId);
        if (!botStatus || botStatus.channelId !== channelId) return;

        // Check if user has listening history
        const history = listeningHistory.getHistory(userId);
        if (!history || history.queue.length === 0) return;

        // Don't show resume prompt if history is from a different guild
        if (history.guildId !== guildId) return;

        // Don't show if bot is already playing something or has a queue
        const { queue } = vm.getQueue(guildId);
        if (botStatus.nowPlaying || queue.length > 0) return;

        log.info(`User ${newState.member.user.tag} joined voice channel with history`);

        try {
            // Create resume prompt embed
            const embed = new EmbedBuilder()
                .setColor(0x6366f1)
                .setTitle('🎵 Resume Listening?')
                .setDescription(`Hey ${newState.member.displayName}! I noticed you were listening to music earlier.`)
                .addFields({
                    name: '📋 Last Session',
                    value: history.nowPlaying 
                        ? `**${history.nowPlaying}**\n*${history.queue.length} track${history.queue.length === 1 ? '' : 's'} in queue*`
                        : `*${history.queue.length} track${history.queue.length === 1 ? '' : 's'} in queue*`,
                    inline: false,
                })
                .setFooter({ text: 'Click "Resume" to continue where you left off, or "Dismiss" to start fresh' })
                .setTimestamp();

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`resume_${userId}`)
                        .setLabel('Resume')
                        .setEmoji('▶️')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`dismiss_history_${userId}`)
                        .setLabel('Dismiss')
                        .setEmoji('❌')
                        .setStyle(ButtonStyle.Secondary)
                );

            // Send DM to user if possible, otherwise send to channel
            try {
                await newState.member.send({
                    embeds: [embed],
                    components: [row],
                });
            } catch (error) {
                // Can't DM user (DMs disabled), send to voice channel instead
                const channel = newState.guild.channels.cache.get(channelId);
                if (channel) {
                    await channel.send({
                        content: `${newState.member}`,
                        embeds: [embed],
                        components: [row],
                    });
                }
            }
        } catch (error) {
            log.error(`Failed to send resume prompt: ${error.message}`);
        }
    },
};

