const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const voiceManager = require('../../utils/voiceManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription("View the current music queue and what's playing now"),

  async execute(interaction) {
    const guildId = interaction.guildId;

    const status = voiceManager.getStatus(guildId);
    if (!status) {
      return interaction.reply({
        content:
          "❌ I'm not in a voice channel! Use `/join` to connect me to your voice channel first.",
        ephemeral: true,
      });
    }

    const queueInfo = voiceManager.getQueue(guildId);
    const {
      nowPlaying,
      queue,
      totalInQueue,
      currentTrack,
      playbackPosition,
      hasOverlay,
      isPaused,
      channelName,
    } = queueInfo;

    // Format duration helper
    const formatDuration = (seconds) => {
      if (!seconds || isNaN(seconds)) return null;
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      }
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    };

    // Get YouTube thumbnail if available
    const getYouTubeThumbnail = (url) => {
      if (!url) return null;
      const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      if (match) {
        return `https://img.youtube.com/vi/${match[1]}/maxresdefault.jpg`;
      }
      return null;
    };

    // Determine embed color based on state
    let embedColor = 0x6366f1; // Default blue
    if (hasOverlay) {
      embedColor = 0x8b5cf6; // Purple when overlay active
    } else if (isPaused) {
      embedColor = 0xf59e0b; // Orange when paused
    }

    const embed = new EmbedBuilder().setTitle('🎵 Music Queue').setColor(embedColor).setTimestamp();

    // Now Playing section with playback position
    if (nowPlaying && currentTrack) {
      let description = `**${nowPlaying}**`;

      // Show playback progress if available
      if (currentTrack.duration && playbackPosition > 0) {
        const currentTime = formatDuration(playbackPosition);
        const totalTime = formatDuration(currentTrack.duration);
        description += `\n\`${currentTime} / ${totalTime}\``;
      } else if (currentTrack.duration) {
        description += ` • \`${formatDuration(currentTrack.duration)}\``;
      }

      // Add state indicators
      if (hasOverlay) {
        description += '\n\n🔊 *Soundboard overlay active*';
      } else if (isPaused) {
        description += '\n\n⏸️ *Paused*';
      }

      const thumbnail = getYouTubeThumbnail(currentTrack.url);
      if (thumbnail && !currentTrack.isSoundboard) {
        embed.setThumbnail(thumbnail);
      }

      embed.setDescription(description);
    } else if (nowPlaying) {
      embed.setDescription(`**${nowPlaying}**`);
    } else {
      embed.setDescription('*Nothing playing*');
    }

    // Queue section
    if (queue.length > 0) {
      const queueList = queue
        .map((track, i) => {
          const num = (i + 1).toString().padStart(2, '0');
          const duration = track.duration ? ` \`${formatDuration(track.duration)}\`` : '';
          return `\`${num}\` ${track.title}${duration}`;
        })
        .join('\n');

      const moreText =
        totalInQueue > 20
          ? `\n\n*...and ${totalInQueue - 20} more track${totalInQueue - 20 === 1 ? '' : 's'}*`
          : '';

      embed.addFields({
        name: `📋 Up Next — ${totalInQueue} track${totalInQueue === 1 ? '' : 's'}`,
        value: queueList + moreText,
        inline: false,
      });
    } else {
      embed.addFields({
        name: '📋 Queue',
        value: '*Queue is empty*\n\nUse `/play` to add tracks!',
        inline: false,
      });
    }

    // Build footer with state info
    let footerText = `Total: ${totalInQueue} track${totalInQueue === 1 ? '' : 's'} in queue`;
    if (channelName) {
      footerText += ` • ${channelName}`;
    }
    if (hasOverlay) {
      footerText += ' • 🔊 Overlay Active';
    } else if (isPaused) {
      footerText += ' • ⏸️ Paused';
    }

    embed.setFooter({ text: footerText });

    await interaction.reply({ embeds: [embed] });
  },
};
