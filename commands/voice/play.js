const { SlashCommandBuilder } = require('discord.js');
const voiceManager = require('../../utils/voiceManager');
const { createPlayerMessage } = require('../../utils/playerEmbed');
const { createLogger } = require('../../utils/logger');

const log = createLogger('PLAY');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a sound file, search for a song, or play from a URL/playlist')
        .addStringOption(option =>
            option
                .setName('source')
                .setDescription('Sound filename, song name/artist/keywords to search, or YouTube/SoundCloud/Spotify URL')
                .setRequired(true)
                .setAutocomplete(true)
        ),

    async execute(interaction) {
        const guildId = interaction.guildId;
        const source = interaction.options.getString('source');
        const user = interaction.user.tag;

        log.info(`Request: "${source}" by ${user} in ${interaction.guild.name}`);

        const status = voiceManager.getStatus(guildId);
        if (!status) {
            return interaction.reply({
                content: '❌ I\'m not in a voice channel! Use `/join` to connect me to your voice channel first.',
                ephemeral: true,
            });
        }

        await interaction.deferReply();

        try {
            const result = await voiceManager.playSound(guildId, source);
            const { nowPlaying, queue } = voiceManager.getQueue(guildId);
            
            if (result.added === 1) {
                log.info(`Playing: "${result.tracks[0].title}" in ${interaction.guild.name}`);
                await interaction.editReply(createPlayerMessage(nowPlaying, queue, false));
            } else {
                log.info(`Added ${result.added} tracks to queue in ${interaction.guild.name}`);
                
                // Show playlist added message with player
                const playerMsg = createPlayerMessage(nowPlaying, queue, false);
                playerMsg.content = `📋 Added **${result.added}** tracks to queue!`;
                await interaction.editReply(playerMsg);
            }
        } catch (error) {
            log.error(`Failed to play "${source}": ${error.message}`);
            await interaction.editReply({
                content: `❌ Failed to play "${source}": ${error.message}\n\n💡 **Tips:**\n• Try searching with song name and artist (e.g., "Bohemian Rhapsody Queen")\n• Use direct URLs for YouTube, SoundCloud, or Spotify\n• For sound files, use the exact filename\n• For playlists, use the playlist URL`,
            });
        }
    },
};
