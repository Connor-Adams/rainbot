const { Events } = require('discord.js');
const voiceManager = require('../utils/voiceManager');
const { createPlayerMessage } = require('../utils/playerEmbed');
const { createLogger } = require('../utils/logger');

const log = createLogger('BUTTONS');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        if (!interaction.isButton()) return;
        if (!interaction.customId.startsWith('player_')) return;

        const guildId = interaction.guildId;
        const status = voiceManager.getStatus(guildId);

        if (!status) {
            return interaction.reply({
                content: '❌ I\'m not in a voice channel!',
                ephemeral: true,
            });
        }

        const action = interaction.customId.replace('player_', '');
        log.debug(`Button: ${action} by ${interaction.user.tag}`);

        try {
            switch (action) {
                case 'pause': {
                    const result = voiceManager.togglePause(guildId);
                    const { nowPlaying, queue } = voiceManager.getQueue(guildId);
                    await interaction.update(createPlayerMessage(nowPlaying, queue, result.paused));
                    break;
                }

                case 'skip': {
                    const skipped = voiceManager.skip(guildId);
                    // Small delay to let next track start
                    await new Promise(r => setTimeout(r, 500));
                    const { nowPlaying, queue } = voiceManager.getQueue(guildId);
                    await interaction.update(createPlayerMessage(nowPlaying, queue, false));
                    break;
                }

                case 'stop': {
                    voiceManager.stopSound(guildId);
                    await interaction.update({
                        embeds: [{
                            color: 0xef4444,
                            title: '⏹️ Stopped',
                            description: 'Playback stopped and queue cleared.',
                        }],
                        components: [],
                    });
                    break;
                }

                case 'queue': {
                    const { nowPlaying, queue, totalInQueue } = voiceManager.getQueue(guildId);
                    
                    let description = nowPlaying 
                        ? `▶️ **Now Playing:** ${nowPlaying}\n\n`
                        : '**Nothing playing**\n\n';

                    if (queue.length > 0) {
                        const queueList = queue.slice(0, 10).map((t, i) => `${i + 1}. ${t.title}`).join('\n');
                        description += `**Queue (${totalInQueue} tracks):**\n${queueList}`;
                        if (totalInQueue > 10) {
                            description += `\n*...and ${totalInQueue - 10} more*`;
                        }
                    } else {
                        description += '*Queue is empty*';
                    }

                    await interaction.reply({
                        embeds: [{
                            color: 0x6366f1,
                            title: '📋 Queue',
                            description,
                        }],
                        ephemeral: true,
                    });
                    break;
                }
            }
        } catch (error) {
            log.error(`Button error: ${error.message}`);
            await interaction.reply({
                content: `❌ ${error.message}`,
                ephemeral: true,
            }).catch(() => {});
        }
    },
};

