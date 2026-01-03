# Voice Input Troubleshooting

## Problem: "Audio too short" - Discord not capturing full speech

If you see logs like:

```
❌ Audio too short (0.127s / 24338 bytes) - Discord VAD may not be detecting your voice
```

This means Discord's Voice Activity Detection (VAD) is not picking up your full speech.

## Solutions:

### 1. Adjust Discord Input Sensitivity (RECOMMENDED)

**On Desktop:**

1. Open Discord User Settings (gear icon)
2. Go to "Voice & Video"
3. Scroll to "Input Sensitivity"
4. **Disable "Automatically determine input sensitivity"**
5. **Drag the slider all the way to the LEFT** (more sensitive)
6. Test by speaking - the green bar should light up for your entire phrase

**Current issue:** The green bar probably only lights up for loud parts of your speech, missing the beginning/end.

### 2. Check Input Device & Volume

1. In Discord Settings → Voice & Video
2. Verify correct input device is selected
3. Check "Input Volume" slider - should be 100% or close to it
4. Use "Let's Check" button to test microphone

### 3. Disable Push-to-Talk

If you're using Push-to-Talk:

1. Switch to "Voice Activity" mode (Discord Settings → Voice & Video)
2. Or ensure you hold the PTT button for your ENTIRE phrase

### 4. Reduce Background Noise

Discord's VAD might be filtering out your voice if it thinks it's background noise:

- Move closer to microphone
- Reduce ambient noise
- Increase microphone gain in system settings

### 5. Check System Microphone Permissions

**macOS:**

```bash
# Check if Discord has mic access
System Preferences → Security & Privacy → Privacy → Microphone
# Ensure Discord is checked
```

**Linux:**

```bash
# Check PulseAudio levels
pavucontrol
# Ensure Discord input isn't muted/low
```

**Windows:**

```
Settings → Privacy → Microphone
# Ensure Discord has permission
```

## Testing Your Fix

After adjusting sensitivity, test with this command in Discord voice:

1. Say: **"Testing one two three four five"** (speak normally, don't shout)
2. Watch the logs for:
   ```
   🎤 Hearing audio from user ... - 200+ chunks, 100000+ bytes, 1.0s+
   ```
3. You should see the duration increase to 1+ seconds for a full sentence

## Quick Fix: Lower Minimum Duration

If Discord sensitivity can't be fixed, you can lower the bot's minimum duration:

**In `.env` or code:**

```typescript
minAudioDuration: 0.1; // Currently 0.5, lower to 0.1
```

This will accept shorter clips, but transcription quality may suffer.

## Expected Audio Capture

For "play bohemian rhapsody" (~2 seconds of speech):

- **Expected:** 384,000 bytes (2s × 192,000 bytes/s)
- **Your current:** 24,338 bytes (0.127s)
- **You're getting:** ~6% of the audio

## Additional Discord Settings to Check

1. **Echo Cancellation:** Turn OFF (may interfere with VAD)
2. **Noise Suppression:** Turn OFF or reduce (may cut your voice)
3. **Automatic Gain Control:** Turn OFF (may lower your volume)
4. **Advanced Voice Activity:** Ensure enabled

## Still Not Working?

Try recording yourself in Discord (start a DM with yourself, record audio):

- If the recording captures your full speech → issue is with bot's audio receiver
- If recording is also cutting off → issue is with Discord/mic settings

## Alternative: Use Manual Trigger

If voice activity detection continues to fail, you could implement a push-to-talk style trigger:

- Press button/send message before speaking
- Bot captures next 10 seconds of audio regardless of VAD
- This bypasses Discord's VAD entirely

Let me know if you need help implementing this!
