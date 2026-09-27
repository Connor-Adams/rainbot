import { createLogger } from '@rainbot/shared';

export const PORT = parseInt(process.env['PORT'] || process.env['PRANJEET_PORT'] || '3002', 10);
export const TOKEN = process.env['PRANJEET_TOKEN'];
export const STT_API_KEY = process.env['STT_API_KEY'] || process.env['OPENAI_API_KEY'];
export const TTS_API_KEY = process.env['TTS_API_KEY'] || process.env['OPENAI_API_KEY'];
export const TTS_PROVIDER = process.env['TTS_PROVIDER'] || 'openai';
// Optional OpenAI-compatible proxy (the LiteLLM instance on the Dokploy host).
// Unset leaves the SDK on its default api.openai.com, so nothing changes until
// it is configured. TTS_BASE_URL wins over OPENAI_BASE_URL, mirroring how
// TTS_API_KEY takes precedence over OPENAI_API_KEY above.
export const TTS_BASE_URL = process.env['TTS_BASE_URL'] || process.env['OPENAI_BASE_URL'];
export const TTS_VOICE = process.env['TTS_VOICE_NAME'] || 'alloy';
export const ORCHESTRATOR_BOT_ID =
  process.env['ORCHESTRATOR_BOT_ID'] || process.env['RAINCLOUD_BOT_ID'];
export const REDIS_URL = process.env['REDIS_URL'];
export const RAINCLOUD_URL = process.env['RAINCLOUD_URL'];
export const WORKER_SECRET = process.env['WORKER_SECRET'];
export const WORKER_INSTANCE_ID =
  process.env['RAILWAY_REPLICA_ID'] || process.env['RAILWAY_SERVICE_ID'] || process.env['HOSTNAME'];
export const WORKER_VERSION =
  process.env['RAILWAY_GIT_COMMIT_SHA'] || process.env['GIT_COMMIT_SHA'];
export const VOICE_INTERACTION_ENABLED = process.env['VOICE_INTERACTION_ENABLED'] === 'true';
export const VOICE_TRIGGER_WORD = process.env['VOICE_TRIGGER_WORD']?.trim() || 'evan';

/** Positive integer from env, or the fallback when unset/blank/non-numeric/<= 0. */
function positiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim().length === 0) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Ceiling on how long the wake-word gate waits after committing the audio
 * buffer for xAI's input transcript to land. It is a CEILING, not a delay: the
 * wait resolves the moment a transcription event for that utterance arrives, so
 * a generous value costs nothing in the normal case and is only paid in full
 * when no transcript arrives at all. Trade-off: too low and a transcript that
 * lands after the commit completes is missed entirely (the gate then never
 * opens and the bot is mute); too high and a turn for which xAI sends no
 * transcript holds its reply decision open that much longer.
 */
export const VOICE_TRANSCRIPT_SETTLE_MS = positiveIntEnv('VOICE_TRANSCRIPT_SETTLE_MS', 2000);

/**
 * How long a user must be silent before Discord ends their audio stream, which
 * is the TURN boundary for the realtime voice path (commit + wake-word
 * decision). Trade-off: lower means a snappier reply but a mid-sentence pause
 * can split one thought into two turns; higher means the user can pause to
 * think but every reply is delayed by at least this long.
 */
export const VOICE_SILENCE_DURATION_MS = positiveIntEnv('VOICE_SILENCE_DURATION_MS', 800);
export const GROK_API_KEY = process.env['GROK_API_KEY'] || process.env['XAI_API_KEY'];
export const GROK_MODEL = process.env['GROK_MODEL'] || 'grok-4-1-fast-reasoning';
/** Voice Agent voice: Ara, Rex, Sal, Eve, Leo (default: Ara) */
export const GROK_VOICE = process.env['GROK_VOICE']?.trim() || 'Ara';
/** Enable music command tools in Voice Agent (play, skip, etc.). Set to "false" to disable. */
export const GROK_VOICE_AGENT_TOOLS = process.env['GROK_VOICE_AGENT_TOOLS'] !== 'false';
// Grok is enabled when an API key is set, unless explicitly disabled with GROK_ENABLED=false
const hasGrokKey = !!GROK_API_KEY;
export const GROK_ENABLED = process.env['GROK_ENABLED'] === 'false' ? false : hasGrokKey;

export const log = createLogger('PRANJEET');
export const hasToken = !!TOKEN;
export const hasOrchestrator = !!ORCHESTRATOR_BOT_ID;
