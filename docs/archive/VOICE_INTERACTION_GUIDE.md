# Voice Interaction Guide

## Overview

Rainbot now supports voice interaction capabilities that allow users to control music playback using voice commands while in a voice channel. Users can speak commands naturally, and the bot will respond with voice feedback.

## Features

- **Voice Command Recognition**: Speak naturally to control music
- **Natural Language Processing**: Commands like "play Bohemian Rhapsody by Queen" or just "skip"
- **Voice Responses**: The bot responds with voice feedback for commands
- **Concurrent User Support**: Multiple users can issue commands (with rate limiting)
- **Smart Command Parsing**: Handles variations and polite phrases

## Supported Voice Commands

### Music Control

| Command    | Examples                                                                                       | Description                              |
| ---------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **Play**   | "play Bohemian Rhapsody"<br>"play some jazz by Miles Davis"<br>"queue Never Gonna Give You Up" | Plays a song or adds it to the queue     |
| **Skip**   | "skip"<br>"skip 3"<br>"next song"                                                              | Skips the current song or multiple songs |
| **Pause**  | "pause"<br>"stop playing"<br>"hold on"                                                         | Pauses playback                          |
| **Resume** | "resume"<br>"continue"<br>"unpause"<br>"keep going"                                            | Resumes playback                         |
| **Stop**   | "stop"<br>"turn off"                                                                           | Stops playback and clears queue          |
| **Queue**  | "queue"<br>"show queue"<br>"what's queued"<br>"what's playing next"                            | Shows what's in the queue                |
| **Clear**  | "clear queue"<br>"clear"                                                                       | Clears the entire queue                  |

### Volume Control

| Command        | Examples                                                | Description                             |
| -------------- | ------------------------------------------------------- | --------------------------------------- |
| **Set Volume** | "volume 50"<br>"set volume to 75"                       | Sets volume to a specific level (0-100) |
| **Adjust**     | "turn it up"<br>"turn it down"<br>"louder"<br>"quieter" | Adjusts volume by 10%                   |

### Help

| Command  | Examples                                  | Description                    |
| -------- | ----------------------------------------- | ------------------------------ |
| **Help** | "help"<br>"what can you do"<br>"commands" | Shows available voice commands |

## Setup Instructions

### Prerequisites

1. Node.js 22.12.0 or higher
2. Discord bot with voice permissions
3. API credentials for speech-to-text and text-to-speech services

### Supported STT/TTS Providers

Currently supported providers:

- **OpenAI Whisper & TTS** (Recommended - Easiest Setup)
  - Single API key for both STT and TTS
  - High accuracy Whisper model for speech recognition
  - Natural-sounding voices
  - Simple setup - no complex console navigation
  - Reasonable pricing (~$0.006/minute for STT, $15/1M characters for TTS)
- **Google Cloud Speech & Text-to-Speech**
  - High accuracy
  - Natural-sounding Neural2 voices
  - More configuration required
  - Reasonable pricing (~$0.006/15 seconds for STT)
- **Azure, AWS (Coming Soon)**

### OpenAI Setup (Recommended)

#### 1. Get API Key

1. Go to [OpenAI API Keys](https://platform.openai.com/api-keys)
2. Sign in or create an account
3. Click **Create new secret key**
4. Copy the key (starts with `sk-`)
5. Add payment method if you haven't already

That's it! Much simpler than Google Cloud Console.

#### 2. Configure Environment Variables

Add to your `.env` file:

```bash
# Voice Interaction Configuration
VOICE_INTERACTION_ENABLED=true
STT_PROVIDER=openai
TTS_PROVIDER=openai
STT_API_KEY=sk-your-openai-api-key-here
TTS_API_KEY=sk-your-openai-api-key-here  # Can be the same key

# Optional: Customize voice settings
VOICE_LANGUAGE=en-US
TTS_VOICE_NAME=alloy  # Options: alloy, echo, fable, onyx, nova, shimmer
```

**Available OpenAI TTS Voices:**

- `alloy` - Neutral, balanced (default)
- `echo` - Male, clear
- `fable` - British accent
- `onyx` - Deep, authoritative
- `nova` - Friendly, energetic
- `shimmer` - Soft, warm

### Google Cloud Setup (Alternative)

#### 1. Enable APIs

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the following APIs:
   - Cloud Speech-to-Text API
   - Cloud Text-to-Speech API

#### 2. Create API Credentials

**Option A: API Key (Simplest)**

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **API Key**
3. Copy the API key
4. (Recommended) Restrict the key to only Speech APIs

**Option B: Service Account (More Secure)**

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **Service Account**
3. Download the JSON key file
4. Set `GOOGLE_APPLICATION_CREDENTIALS` environment variable to the file path

#### 3. Configure Environment Variables

Add to your `.env` file:

```bash
# Voice Interaction Configuration
VOICE_INTERACTION_ENABLED=true
STT_PROVIDER=google
TTS_PROVIDER=google
STT_API_KEY=your_google_cloud_api_key_here
TTS_API_KEY=your_google_cloud_api_key_here

# Optional: Customize voice settings
VOICE_LANGUAGE=en-US
TTS_VOICE_NAME=en-US-Neural2-J
```

**Available TTS Voice Names:**

- `en-US-Neural2-J` - Male, natural (default)
- `en-US-Neural2-C` - Female, natural
- `en-US-Neural2-D` - Male, professional
- `en-US-Neural2-F` - Female, young
- See [Google TTS Voices](https://cloud.google.com/text-to-speech/docs/voices) for more

### Installation

### Installation

1. Install required packages:

**For OpenAI (Recommended):**

```bash
npm install openai
```

**For Google Cloud:**

```bash
npm install @google-cloud/speech @google-cloud/text-to-speech
```

2. Restart the bot:

```bash
npm run start
```

3. The bot will log: `Voice interaction system initialized`

## Usage

### Enabling Voice Commands

**As a Server Administrator:**

1. Use the `/voice-control enable` slash command
2. The bot will confirm: "✅ Voice commands enabled!"

**Users can now:**

1. Join a voice channel with the bot
2. Simply speak commands naturally
3. The bot will process the command and respond with voice

### Disabling Voice Commands

Use `/voice-control disable` to turn off voice commands for the server.

### Checking Status

Use `/voice-control status` to see:

- Whether voice commands are enabled
- Usage statistics (total commands, success rate, latency)
- Active voice sessions

## How It Works

### Architecture Flow

```
User speaks → Discord captures audio → Bot receives PCM audio stream →
Speech-to-Text API → Transcribed text → Command parser →
Execute command → Generate TTS response → Play response via voice
```

### Technical Details

1. **Audio Capture**: Discord.js VoiceReceiver captures PCM audio at 48kHz, 16-bit
2. **Speech Detection**: Voice activity detection triggers processing after 1 second of silence
3. **Speech-to-Text**: Audio sent to Google Cloud Speech API for transcription
4. **Command Parsing**: Natural language parsing with confidence scoring
5. **Command Execution**: Integrates with existing music playback system
6. **Text-to-Speech**: Generates voice response using Google Cloud TTS
7. **Response Playback**: Plays TTS audio as soundboard overlay

### Concurrency Handling

- Each user gets their own voice session
- Commands are queued and processed sequentially per guild
- Rate limiting: Max 10 commands/minute, 60/hour per user
- Minimum 2 seconds between commands from same user

### Privacy & Security

- Audio is only sent to STT API when speech is detected
- Audio is not stored or logged
- Transcribed text is logged for debugging (configurable)
- API credentials should be kept secure
- Use service accounts or restricted API keys

## Troubleshooting

### Voice commands not working

**Check 1: Is it enabled?**

```
/voice-control status
```

**Check 2: Check bot logs**
Look for:

- `Voice interaction system initialized` on startup
- `Voice interaction not available` indicates configuration issues
- `Failed to initialize Google Speech client` indicates missing packages or credentials

**Check 3: API Credentials**

- Verify API keys are correct in `.env`
- Check Google Cloud Console that APIs are enabled
- Check API quota hasn't been exceeded

**Check 4: Dependencies**

```bash
npm list @google-cloud/speech @google-cloud/text-to-speech
```

If missing:

```bash
npm install @google-cloud/speech @google-cloud/text-to-speech
```

### Bot doesn't hear me

**Check:**

1. Are you in the same voice channel as the bot?
2. Is your microphone working in Discord?
3. Check Discord voice permissions for the bot
4. Try enabling "Voice Activity" instead of Push-to-Talk in Discord

### Bot doesn't respond

**Check:**

1. Did the bot confirm it heard you? (Check logs)
2. Is the command valid? Try saying "help"
3. Check STT confidence in logs: `Transcribed: "..." (confidence: X.XX)`
4. Low confidence (<0.6) commands are rejected

### Commands are misunderstood

**Tips:**

- Speak clearly and at a normal pace
- Reduce background noise
- Include keywords: "play [song]", "skip", "pause"
- Try including artist name: "play [song] by [artist]"
- Commands work best in English (en-US)

### High latency / slow responses

**Typical latency:**

- STT: 500-1500ms
- Command execution: 100-500ms
- TTS: 300-800ms
- **Total: 1-3 seconds**

**If slower:**

- Check internet connection
- Check Google Cloud API status
- Check bot server resources
- Consider using a closer Google Cloud region

### API costs too high

**Cost estimates (OpenAI - Recommended):**

- STT (Whisper): ~$0.006 per minute of audio
- TTS: ~$15 per 1 million characters
- Example: 100 commands/day ≈ $0.30/month STT + $0.05/month TTS = **$0.35/month**

**Cost estimates (Google Cloud):**

- STT: ~$0.006 per 15 seconds of audio
- TTS: ~$4 per 1 million characters
- Example: 100 commands/day ≈ $0.60/month STT + $0.10/month TTS = **$0.70/month**

**To reduce costs:**

1. Set `VOICE_INTERACTION_ENABLED=false` when not needed
2. Use `/voice-control disable` for specific servers
3. Enable only for specific guilds (configure in code)
4. Use OpenAI instead of Google (about 50% cheaper)

## Configuration Options

### Environment Variables

| Variable                    | Description                    | Default                                        | Required |
| --------------------------- | ------------------------------ | ---------------------------------------------- | -------- |
| `VOICE_INTERACTION_ENABLED` | Enable voice commands globally | `false`                                        | No       |
| `STT_PROVIDER`              | Speech-to-text provider        | `openai`                                       | No       |
| `TTS_PROVIDER`              | Text-to-speech provider        | `openai`                                       | No       |
| `STT_API_KEY`               | STT API credentials            | -                                              | Yes\*    |
| `TTS_API_KEY`               | TTS API credentials            | -                                              | Yes\*    |
| `VOICE_LANGUAGE`            | Language for STT/TTS           | `en-US`                                        | No       |
| `TTS_VOICE_NAME`            | TTS voice to use               | `alloy` (OpenAI)<br>`en-US-Neural2-J` (Google) | No       |

\*Required if voice interaction is enabled

### Advanced Configuration

To customize behavior, edit `utils/voice/voiceInteractionManager.ts`:

```typescript
const DEFAULT_CONFIG: VoiceInteractionConfig = {
  enabled: false,
  sttProvider: 'google',
  ttsProvider: 'google',
  language: 'en-US',
  maxAudioDuration: 10, // Max seconds to record
  minAudioDuration: 1, // Min seconds before processing
  confidenceThreshold: 0.6, // Min STT confidence (0-1)
  rateLimit: {
    maxCommandsPerMinute: 10,
    maxCommandsPerHour: 60,
  },
};
```

## Limitations

### Current Limitations

1. **Language Support**: Currently optimized for English (en-US)
   - Other languages can be configured via `VOICE_LANGUAGE`
   - Command patterns are English-only

2. **Music Playback**: Voice responses may briefly interrupt music
   - TTS plays as soundboard overlay
   - Music continues underneath

3. **Concurrent Commands**: Commands are processed sequentially per guild
   - Multiple users can speak, but commands execute one at a time
   - Rate limiting prevents spam

4. **Background Noise**: STT accuracy affected by:
   - Music playing in voice channel
   - Other users talking
   - Background noise in user's environment

5. **Wake Word**: No wake word detection yet
   - Bot listens to all speech when enabled
   - Consider privacy implications

### Planned Features

- [ ] Wake word detection ("Hey bot, play...")
- [ ] Multi-language support
- [ ] Local Whisper STT (no API costs)
- [ ] Azure and AWS provider support
- [ ] Contextual awareness (follow-up commands)
- [ ] Voice queue navigation ("play track 3")
- [ ] Custom vocabulary (soundboard names)

## Development

### Architecture

See `utils/voice/` directory:

- `voiceInteractionManager.ts` - Main orchestrator
- `speechRecognition.ts` - STT provider abstraction
- `textToSpeech.ts` - TTS provider abstraction
- `voiceCommandParser.ts` - Natural language parsing
- `voiceInteractionInstance.ts` - Singleton manager

### Adding New STT/TTS Providers

Implement the provider interfaces in `speechRecognition.ts` and `textToSpeech.ts`:

```typescript
interface STTProvider {
  recognize(audioBuffer: Buffer, languageCode: string): Promise<SpeechRecognitionResult>;
  recognizeStream(languageCode: string): NodeJS.WritableStream;
}

interface TTSProvider {
  synthesize(request: TextToSpeechRequest): Promise<TextToSpeechResult>;
}
```

### Testing

Run voice parser tests:

```bash
npm test -- voiceCommandParser.test.ts
```

## Support

For issues or questions:

1. Check this documentation
2. Review bot logs for error messages
3. Open an issue on GitHub with:
   - Error messages from logs
   - Steps to reproduce
   - Environment details (Node version, OS)

## License

This feature is part of Rainbot and follows the same license.
