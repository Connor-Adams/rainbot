const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check bot latency and response time'),
    async execute(interaction) {
        const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
        const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
        const websocket = interaction.client.ws.ping;

        const embed = new EmbedBuilder()
            .setTitle('🏓 Pong!')
            .setColor(0x6366f1)
            .addFields(
                { name: '⏱️ Roundtrip', value: `${roundtrip}ms`, inline: true },
                { name: '💓 WebSocket', value: `${websocket}ms`, inline: true }
            )
            .setTimestamp();

        await interaction.editReply({ content: '', embeds: [embed] });
    }
};