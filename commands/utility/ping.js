"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executePing = executePing;
exports.createPingEmbed = createPingEmbed;
const discord_js_1 = require("discord.js");
function executePing(roundtrip, websocket) {
    return {
        roundtrip,
        websocket,
    };
}
function createPingEmbed(result) {
    return new discord_js_1.EmbedBuilder()
        .setTitle('🏓 Pong!')
        .setColor(0x6366f1)
        .addFields({ name: '⏱️ Roundtrip', value: `${result.roundtrip}ms`, inline: true }, { name: '💓 WebSocket', value: `${result.websocket}ms`, inline: true })
        .setTimestamp();
}
