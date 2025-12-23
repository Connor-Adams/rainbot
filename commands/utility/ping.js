const { SlashCommandBuilder } = require('discord.js');
const { executePing, createPingEmbed } = require('./ping.ts');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check bot latency and response time'),
    async execute(interaction) {
        const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
        const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
        const websocket = interaction.client.ws.ping;

        const result = executePing(roundtrip, websocket);
        const embed = createPingEmbed(result);

        await interaction.editReply({ content: '', embeds: [embed] });
    }
};