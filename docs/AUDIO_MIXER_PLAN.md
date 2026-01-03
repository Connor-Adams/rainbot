# Plan for True Simultaneous Audio Playback

## Current Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Music Source  │ ──► │ AudioPlayer  │ ──► │ VoiceConnection │ ──► Discord
└─────────────────┘     └──────────────┘     └─────────────────┘
```

Discord.js `AudioPlayer` is a black box - we can't intercept its output stream.

---

## Proposed Architecture: Custom Audio Mixer

```
┌─────────────────┐
│   Music Source  │ ──┐
└─────────────────┘   │    ┌──────────────┐     ┌──────────────┐     ┌─────────────────┐
                      ├──► │ FFmpeg Mixer │ ──► │ AudioPlayer  │ ──► │ VoiceConnection │
┌─────────────────┐   │    └──────────────┘     └──────────────┘     └─────────────────┘
│   TTS Source    │ ──┘
└─────────────────┘
```

**Key Insight**: Mix audio streams _before_ they reach the AudioPlayer.

---

## Implementation Steps

### Phase 1: Create Audio Mixer Module

```typescript
// utils/voice/audioMixer.ts

interface MixerChannel {
  id: string; // 'music' | 'tts' | 'soundboard'
  stream: PassThrough; // Input stream for this channel
  volume: number; // 0.0 - 1.0
  ducking: boolean; // Auto-lower when other channels active
}

class AudioMixer {
  private channels: Map<string, MixerChannel>;
  private ffmpegProcess: ChildProcess;
  private outputStream: PassThrough;

  // Creates FFmpeg process with multiple inputs
  // Outputs mixed PCM stream
}
```

### Phase 2: Modify Audio Resource Creation

Current flow in `audioResource.ts`:

```typescript
// Current: Returns resource directly to player
return createAudioResource(stream, options);
```

New flow:

```typescript
// New: Pipe stream into mixer's music channel
mixer.pipeToChannel('music', stream);
// Player reads from mixer's output
return createAudioResource(mixer.outputStream, options);
```

### Phase 3: FFmpeg Mixing Command

```bash
ffmpeg \
  -f s16le -ar 48000 -ac 2 -i pipe:0 \  # Music input (named pipe or stdin)
  -f s16le -ar 48000 -ac 2 -i pipe:3 \  # TTS input (fd 3)
  -filter_complex "
    [0:a]volume=1.0[music];
    [1:a]volume=0.8[tts];
    [music][tts]amix=inputs=2:duration=longest:dropout_transition=0[out]
  " \
  -map "[out]" \
  -f s16le -ar 48000 -ac 2 pipe:1
```

### Phase 4: Integration Points

| Component              | Changes Required                       |
| ---------------------- | -------------------------------------- |
| `connectionManager.ts` | Create mixer per guild, pass to player |
| `playbackManager.ts`   | Route music streams through mixer      |
| `soundboardManager.ts` | Route soundboard through mixer         |
| `ttsPlayer.ts`         | Route TTS through mixer                |
| `VoiceState` type      | Add `mixer: AudioMixer` property       |

---

## Detailed File Changes

### 1. New File: `utils/voice/audioMixer.ts`

```typescript
import { spawn, ChildProcess } from 'child_process';
import { PassThrough, Readable } from 'stream';
import { createLogger } from '../logger';

const log = createLogger('AUDIO_MIXER');

interface MixerChannel {
  id: string;
  inputStream: PassThrough;
  volume: number;
  active: boolean;
}

export class AudioMixer {
  private guildId: string;
  private channels: Map<string, MixerChannel> = new Map();
  private ffmpeg: ChildProcess | null = null;
  private outputStream: PassThrough;
  private isRunning = false;

  constructor(guildId: string) {
    this.guildId = guildId;
    this.outputStream = new PassThrough();
    this.initializeChannels();
  }

  private initializeChannels() {
    // Create default channels
    this.channels.set('music', {
      id: 'music',
      inputStream: new PassThrough(),
      volume: 1.0,
      active: false,
    });

    this.channels.set('tts', {
      id: 'tts',
      inputStream: new PassThrough(),
      volume: 0.9,
      active: false,
    });

    this.channels.set('soundboard', {
      id: 'soundboard',
      inputStream: new PassThrough(),
      volume: 0.8,
      active: false,
    });
  }

  start() {
    if (this.isRunning) return;

    // Spawn FFmpeg with multiple inputs using named pipes or additional file descriptors
    this.ffmpeg = spawn(
      'ffmpeg',
      [
        '-f',
        's16le',
        '-ar',
        '48000',
        '-ac',
        '2',
        '-i',
        'pipe:0', // Music
        '-f',
        's16le',
        '-ar',
        '48000',
        '-ac',
        '2',
        '-i',
        'pipe:3', // TTS
        '-f',
        's16le',
        '-ar',
        '48000',
        '-ac',
        '2',
        '-i',
        'pipe:4', // Soundboard
        '-filter_complex',
        '[0:a]volume=1.0[m];[1:a]volume=0.9[t];[2:a]volume=0.8[s];[m][t][s]amix=inputs=3:duration=longest[out]',
        '-map',
        '[out]',
        '-f',
        's16le',
        '-ar',
        '48000',
        '-ac',
        '2',
        'pipe:1',
      ],
      {
        stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe'],
      }
    );

    // Connect channel streams to FFmpeg inputs
    this.channels.get('music')!.inputStream.pipe(this.ffmpeg.stdin!);
    this.channels.get('tts')!.inputStream.pipe(this.ffmpeg.stdio[3] as any);
    this.channels.get('soundboard')!.inputStream.pipe(this.ffmpeg.stdio[4] as any);

    // Pipe mixed output
    this.ffmpeg.stdout!.pipe(this.outputStream);

    this.isRunning = true;
    log.info(`Audio mixer started for guild ${this.guildId}`);
  }

  getOutputStream(): PassThrough {
    return this.outputStream;
  }

  getChannelInput(channelId: string): PassThrough | null {
    return this.channels.get(channelId)?.inputStream || null;
  }

  setVolume(channelId: string, volume: number) {
    const channel = this.channels.get(channelId);
    if (channel) {
      channel.volume = Math.max(0, Math.min(1, volume));
      // Would need to restart FFmpeg with new volumes or use audio filter
    }
  }

  destroy() {
    if (this.ffmpeg) {
      this.ffmpeg.kill();
      this.ffmpeg = null;
    }
    this.channels.forEach((ch) => ch.inputStream.destroy());
    this.outputStream.destroy();
    this.isRunning = false;
    log.info(`Audio mixer destroyed for guild ${this.guildId}`);
  }
}

// Manager for guild mixers
const mixers = new Map<string, AudioMixer>();

export function getMixer(guildId: string): AudioMixer {
  let mixer = mixers.get(guildId);
  if (!mixer) {
    mixer = new AudioMixer(guildId);
    mixers.set(guildId, mixer);
  }
  return mixer;
}

export function destroyMixer(guildId: string) {
  const mixer = mixers.get(guildId);
  if (mixer) {
    mixer.destroy();
    mixers.delete(guildId);
  }
}
```

### 2. Modify `connectionManager.ts`

```typescript
// In joinChannel():
const mixer = getMixer(guildId);
mixer.start();

// Create audio resource from mixer output instead of direct source
const mixedResource = createAudioResource(mixer.getOutputStream(), {
  inputType: StreamType.Raw,
});

player.play(mixedResource);

// Store mixer reference in voice state
voiceStates.set(guildId, {
  ...existingState,
  mixer,
});
```

### 3. Modify `playbackManager.ts`

```typescript
// In playNext() or createTrackResource():
const mixer = state.mixer;
const musicInput = mixer.getChannelInput('music');

// Pipe the track stream to the mixer's music channel
trackStream.pipe(musicInput);
```

### 4. Modify `ttsPlayer.ts`

```typescript
export async function playTTSAudio(guildId: string, audioFilePath: string) {
  const mixer = getMixer(guildId);
  const ttsInput = mixer.getChannelInput('tts');

  // Pipe TTS audio to mixer's TTS channel
  const ttsStream = createReadStream(audioFilePath);
  ttsStream.pipe(ttsInput);

  // Wait for stream to finish
  await new Promise((resolve) => ttsStream.on('end', resolve));
}
```

---

## Challenges & Solutions

| Challenge                     | Solution                                                            |
| ----------------------------- | ------------------------------------------------------------------- |
| FFmpeg multiple stdin         | Use `stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe']` for extra FDs |
| Silence when channel inactive | Feed silence buffers to inactive channels                           |
| Volume control                | Either restart FFmpeg or use `volume` filter dynamically            |
| Latency                       | Tune FFmpeg buffer sizes with `-probesize` and `-analyzeduration`   |
| Channel sync                  | All channels must have same sample rate/format                      |

---

## Testing Plan

1. **Unit tests** for AudioMixer class
2. **Integration test**: Play music, inject TTS, verify both audible
3. **Stress test**: Rapid TTS injections during music
4. **Volume test**: Verify ducking behavior

---

## Estimated Effort

| Phase                        | Time Estimate   |
| ---------------------------- | --------------- |
| Phase 1: AudioMixer module   | 4-6 hours       |
| Phase 2: Integration         | 6-8 hours       |
| Phase 3: Testing & debugging | 4-6 hours       |
| Phase 4: Edge cases & polish | 2-4 hours       |
| **Total**                    | **16-24 hours** |

---

## Alternative Approaches

1. **Web Audio API style** - Use `audiomixer` npm package (simpler but less control)
2. **Multiple bots** - Have separate bot accounts for TTS (complex permission management)
3. **Pre-mixed audio** - Generate mixed files offline (not suitable for real-time TTS)

---

## Next Steps

To begin implementation, start with Phase 1 by creating the `utils/voice/audioMixer.ts` module.
