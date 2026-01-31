# Future work (TODOs)

Short list of tracked TODOs; implement when prioritised.

- **TTS true stream mixing** – `utils/voice/ttsPlayer.ts`: ducking (pause → TTS → resume at position) is implemented when the voice manager exposes `getPlaybackPositionSeconds`/`resumeAtPosition`. True same-stream mixing (TTS + music simultaneously via FFmpeg) is future work.
