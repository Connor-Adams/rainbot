const { SlashCommandBuilder } = require('discord.js');
const { executePlay, executePlayDeferred } = require('./play.ts');

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
        const userId = interaction.user.id;

        // Check if we need to defer
        const initialResult = await executePlay({ guildId, source, userId });
        
        if (initialResult.needsDefer) {
            await interaction.deferReply();
            const deferredResult = await executePlayDeferred({ guildId, source, userId });
            
            if (deferredResult.playerMessage) {
                await interaction.editReply(deferredResult.playerMessage);
            } else if (deferredResult.content) {
                await interaction.editReply({ content: deferredResult.content });
            }
        } else {
            if (initialResult.playerMessage) {
                await interaction.reply(initialResult.playerMessage);
            } else {
                await interaction.reply({
                    content: initialResult.content || 'An error occurred',
                    ephemeral: initialResult.ephemeral || false,
                });
            }
        }
    },
};
