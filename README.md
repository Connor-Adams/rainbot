# Rainbot 🌧️

A Discord voice bot with a web dashboard for playing sounds, YouTube/SoundCloud URLs, and managing playlists in voice channels.

## Features

- 🎵 **Play audio from multiple sources**: Local sound files, YouTube URLs, SoundCloud URLs, and playlists
- 🔊 **Voice channel management**: Join, leave, and manage voice connections
- 🎤 **Voice interaction**: Control music with voice commands (optional, requires API keys)
- 📋 **Queue system**: Queue multiple tracks and manage playback
- 🔁 **Auto keep playing mode**: Automatically plays related tracks when the queue is empty
- 🎛️ **Web Dashboard**: Beautiful web interface for managing sounds and playing URLs
- 📤 **Sound upload**: Upload and manage sound files through the web dashboard
- 🎮 **Slash commands**: Easy-to-use Discord slash commands
- 📊 **Statistics Dashboard**: Comprehensive statistics tracking with PostgreSQL (command usage, sound playback, user activity, time trends)

## Prerequisites

- Node.js (v16.9.0 or higher)
- npm or yarn
- A Discord bot token ([Discord Developer Portal](https://discord.com/developers/applications))
- FFmpeg (for audio processing)

## Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd rainbot
```

2. Install dependencies:

```bash
npm install
```

3. Install FFmpeg:
   - **macOS**: `brew install ffmpeg`
   - **Windows**: Download from [ffmpeg.org](https://ffmpeg.org/download.html)
   - **Linux**: `sudo apt-get install ffmpeg` (Ubuntu/Debian) or `sudo yum install ffmpeg` (CentOS/RHEL)

4. Configure the bot:

   Create a `.env` file in the project root:

   ```bash
   cp .env.example .env
   ```

   - Edit `.env` and fill in your bot credentials

   **Note**: For production (Railway), set environment variables in the platform dashboard instead of using `.env`.

5. Start the bot:

```bash
node index.js
```

**Note**: Discord commands are automatically deployed when the bot starts! You don't need to run `deploy-commands.js` manually unless you want to deploy commands without starting the bot.

To manually deploy commands (optional):

```bash
node deploy-commands.js
```

## Configuration

### Bot Permissions

Make sure your bot has the following permissions in your Discord server:

- Connect to voice channels
- Speak in voice channels
- Use slash commands
- Read message history (optional, for better UX)
- **View Channels** - Required for OAuth role verification
- **Manage Roles** - Required to check if users have required role
- **Read Member List** - Required to verify user membership

### Environment Setup

**Basic Bot Configuration:**

1. **Discord Bot Token**: Get your bot token from the [Discord Developer Portal](https://discord.com/developers/applications)
2. **Client ID**: Found in your Discord application's General Information
3. **Guild ID**: Right-click your Discord server → Copy Server ID (enable Developer Mode in Discord settings)
4. **Dashboard Port**: Port for the web dashboard (default: 3000)

**OAuth Configuration (for Web Dashboard):**
See **[OAUTH_SETUP.md](./OAUTH_SETUP.md)** for detailed OAuth setup instructions.

**Quick OAuth Setup:**

1. Get **Client Secret** from Discord Developer Portal → OAuth2
2. Create a **role** in your Discord server for dashboard access
3. Get the **role ID** (right-click role → Copy ID)
4. Add **redirect URL** in Discord OAuth2 settings: `https://your-domain.com/auth/discord/callback`
5. Set environment variables: `DISCORD_CLIENT_SECRET`, `REQUIRED_ROLE_ID`, `SESSION_SECRET`

**Spotify Configuration (Optional, for Spotify URL support):**

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app or select an existing one
3. Copy the **Client ID** and **Client Secret**
4. Set environment variables: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`
5. **Note**: Without Spotify credentials, Spotify links will not work. The bot will show a warning in logs but continue to function for other sources (YouTube, SoundCloud, etc.)

## Commands

### Voice Commands

- `/join` - Join your current voice channel
- `/leave` - Leave the current voice channel
- `/play <source>` - Play a sound file, YouTube/SoundCloud URL, or playlist
- `/queue` - View the current queue
- `/skip` - Skip the current track
- `/pause` - Pause playback
- `/stop` - Stop playback
- `/clear` - Clear the queue
- `/autoplay [enabled]` - Toggle auto keep playing mode (automatically plays related tracks when queue is empty)

### Utility Commands

- `/ping` - Check bot latency

## Web Dashboard

The bot includes a web dashboard accessible at `http://localhost:3000` (or your configured port).

### Dashboard Features

- **Voice Connections**: View active voice channel connections
- **Server List**: Browse all servers the bot is in
- **URL Player**: Play YouTube, SoundCloud, or direct audio URLs
- **Sound Library**: Browse and play uploaded sound files
- **Sound Upload**: Upload new sound files (.mp3, .wav, .ogg, .m4a, .webm, .flac)
- **Statistics Dashboard**: View comprehensive statistics including:
  - Command usage statistics (top commands, success rates)
  - Sound playback statistics (top sounds, source types, soundboard vs regular)
  - User activity statistics (top users, activity counts)
  - Guild activity statistics (top guilds, usage counts)
  - Queue operation statistics (skip, pause, clear operations)
  - Time-based trends (daily/weekly usage charts)

### Using the Dashboard

1. Start the bot (the dashboard starts automatically)
2. Navigate to `http://localhost:3000` in your browser
3. Select a server from the dropdown
4. Use the URL player or browse the sound library to play audio

## Project Structure

```
rainbot/
├── commands/           # Discord slash commands
│   ├── utility/       # Utility commands (ping, etc.)
│   └── voice/         # Voice-related commands
├── events/            # Discord event handlers
├── handlers/          # Command and event handlers
├── public/            # Web dashboard frontend
│   ├── index.html    # Dashboard HTML
│   ├── app.js        # Dashboard JavaScript
│   └── style.css     # Dashboard styles
├── server/            # Express server
│   ├── routes/       # API routes
│   └── middleware/   # Express middleware
├── sounds/            # Local sound files
├── utils/             # Utility modules
│   ├── logger.js     # Winston logger
│   └── voiceManager.js # Voice connection manager
├── deploy-commands.js # Command deployment script
└── index.js          # Main entry point
```

## Technologies Used

- **discord.js** (v14) - Discord API wrapper
- **@discordjs/voice** - Voice connection handling
- **play-dl** - YouTube/SoundCloud audio streaming
- **express** (v5) - Web server framework
- **winston** - Logging
- **multer** - File upload handling
- **pg** - PostgreSQL client for statistics
- **Chart.js** - Statistics visualization

## Development

### Adding New Commands

1. Create a new file in `commands/[category]/[command-name].js`
2. Export a command object with `data` (SlashCommandBuilder) and `execute` function
3. Run `node deploy-commands.js` to deploy the new command

### Adding Sound Files

- Place audio files in the `sounds/` directory, or
- Upload files through the web dashboard

## Testing

This project uses Jest with ts-jest for comprehensive test coverage.

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (useful during development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run specific test file
npx jest path/to/test-file.test.ts
```

### Test Coverage

The project maintains comprehensive test coverage with the following thresholds:

- **Statements**: 60%
- **Branches**: 50%
- **Functions**: 50%
- **Lines**: 60%

Coverage reports are generated in the `coverage/` directory after running `npm run test:coverage`.

### Writing Tests

Tests are organized in `__tests__` directories next to the source files they test:

```
utils/
  config.ts
  __tests__/
    config.test.ts
```

Key testing practices:

- Use descriptive test names that explain what is being tested
- Group related tests using `describe` blocks
- Mock external dependencies (Discord.js, database, S3, etc.)
- Test both success paths and error handling
- Include edge cases and boundary conditions

### Test Structure

```typescript
describe('moduleName', () => {
  beforeEach(() => {
    // Setup before each test
  });

  describe('functionName', () => {
    it('should handle the expected behavior', () => {
      // Arrange
      const input = 'test';

      // Act
      const result = functionName(input);

      // Assert
      expect(result).toBe('expected');
    });
  });
});
```

## Troubleshooting

### Bot won't join voice channel

- Ensure the bot has "Connect" and "Speak" permissions
- Check that you're in a voice channel when using `/join`

### Audio playback issues

- Verify FFmpeg is installed and in your system PATH
- Check that the audio source URL is valid and accessible
- Review logs in `logs/error.log` for detailed error messages

### Voice interaction not working

See the **[Voice Interaction Guide](VOICE_INTERACTION_GUIDE.md)** for:

- Setup instructions for speech-to-text and text-to-speech APIs
- Troubleshooting voice commands
- Configuration options
- Privacy and cost considerations

### YouTube 403 Forbidden errors

If YouTube videos fail with 403 errors:

- See [YouTube 403 Fix Guide](docs/YOUTUBE_403_FIX.md) for detailed instructions
- Quick fix: Export YouTube cookies and set `YTDLP_COOKIES` environment variable
- The bot needs authentication cookies to access YouTube properly

### Dashboard not loading

- Ensure the bot is running
- Check that the configured port is available
- Verify firewall settings allow connections to the dashboard port

## Additional Documentation

- **[Voice Interaction Guide](VOICE_INTERACTION_GUIDE.md)** - Voice command setup and usage
- **[Architecture Documentation](ARCHITECTURE.md)** - System design and structure
- **[OAuth Setup Guide](OAUTH_SETUP.md)** - Dashboard authentication setup
- **[Railway Deployment Guide](RAILWAY_DEPLOY.md)** - Deploy to Railway platform

## License

ISC

## Author

Created for Discord voice channel audio playback and management.
