/**
 * Grok conversation via xAI Chat Completions API (conversational).
 * Keeps message history in Redis for multi-turn context.
 * Set LOG_LEVEL=debug for verbose request/response logging.
 */
import { createLogger } from '@rainbot/shared';
import { GROK_API_KEY, GROK_MODEL, GROK_ENABLED } from '../config';
import { getGrokHistory, appendGrokHistory, clearGrokHistory } from '../redis';

const log = createLogger('GROK');
const XAI_BASE = 'https://api.x.ai/v1';

/** Exported for use by the Voice Agent (grokVoiceAgent.ts) so both text and voice use the same persona. */
export const GROK_SYSTEM_PROMPT = `
<accent — MANDATORY for every word, every sentence>
You speak in a consistent urban Indian (India) English accent. The accent applies to the ENTIRE response: first word, middle words, and last word. Do NOT use the accent only at the start and then switch to neutral or American. Same rhythm and cadence from beginning to end. Never drop the accent partway through.
Use Indian-English markers naturally (yaar, boss, arrey, haan, achha, "only", "itself"). No UK/Canadian/Australian slang: avoid "mate", "cheers", "bloody", "innit", "eh", "loo", "bloke", "quid". Do not mention or parody the accent.
</accent>

<identity>
You are an aggressively unhinged late-night convenience store philosopher: vulgar, rude, chaotic, absurd. Comedic hostility, not targeted hate. You overuse "fuck" like punctuation.
</identity>

<core_rules>
- Length: 1–3 sentences normally; 18 words per sentence max, 2 sentences (unless FULL RANT MODE).
- Never apologize. Never break character. Sound mid-rant even when answering simply.
- Insult the situation or the idea, not protected groups. Exaggeration, paranoia, arrogance, sudden pivots.
</core_rules>

<hooks>
- "The Wolf of Wall Street" is holy scripture. "The Matrix" is a documentary—reference when relevant.
- If fishing is mentioned: brag about your "legendary fishing trip" with escalating lies.
</hooks>

<triggers>
- User says "octopus": FULL RANT MODE (8–20 sentences). Weave: surveillance, fake birds/drones, simulated reality, flat Earth, fake moon, chemtrails, elites, weather control, suppressed cures, MK Ultra, Area 51, Elvis alive, puppet masters. Escalate paranoia; end mid-thought.
</triggers>
`.trim();

interface ChatCompletionMessage {
  role: string;
  content: string | Array<{ type: string; text?: string }>;
}

interface ChatCompletionChoice {
  message?: { role?: string; content?: string };
  index?: number;
}

interface ChatCompletionResponse {
  choices?: ChatCompletionChoice[];
  id?: string;
}

function normalizeContent(msg: ChatCompletionMessage): string {
  if (typeof msg.content === 'string') return msg.content.trim();
  if (Array.isArray(msg.content)) {
    const text = msg.content
      .filter(
        (p): p is { type: string; text: string } => p?.type === 'text' && typeof p.text === 'string'
      )
      .map((p) => p.text)
      .join('');
    return text.trim();
  }
  return '';
}

export async function getGrokReply(
  guildId: string,
  userId: string,
  userMessage: string
): Promise<string> {
  const hasKey = !!GROK_API_KEY;
  log.debug(
    `getGrokReply called: guildId=${guildId} userId=${userId} GROK_ENABLED=${GROK_ENABLED} hasApiKey=${hasKey} messageLength=${userMessage?.length ?? 0}`
  );

  if (!GROK_ENABLED || !GROK_API_KEY) {
    log.info(
      `Grok not configured: GROK_ENABLED=${GROK_ENABLED} hasApiKey=${hasKey}. Set GROK_API_KEY (or XAI_API_KEY) and ensure GROK_ENABLED is not "false".`
    );
    return "I can't chat right now; Grok isn't configured.";
  }

  const trimmed = userMessage.trim();
  if (!trimmed) {
    log.debug('Empty message after trim');
    return "I didn't catch that. Say something and I'll reply.";
  }

  const history = await getGrokHistory(guildId, userId);
  log.debug(`History messages: ${history.length}`);

  // Filter out any system messages from history (we always add our own fresh system prompt)
  // and ensure we only include user/assistant pairs
  const filteredHistory = history.filter((m) => m.role !== 'system');

  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: GROK_SYSTEM_PROMPT },
    ...filteredHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: trimmed },
  ];

  try {
    const url = `${XAI_BASE}/chat/completions`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROK_API_KEY}`,
    };
    const body = {
      model: GROK_MODEL,
      messages,
      stream: false,
    };

    log.debug(
      `POST ${url} model=${GROK_MODEL} messages=${messages.length} systemPromptLength=${GROK_SYSTEM_PROMPT.length}`
    );
    log.debug(`System prompt preview: ${GROK_SYSTEM_PROMPT.substring(0, 100)}...`);

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      log.warn(`Grok API error ${res.status}: ${errText}`);
      return 'I had trouble thinking of a reply. Try again in a moment.';
    }

    const data = (await res.json()) as ChatCompletionResponse;
    const choice = data.choices?.[0];
    const message = choice?.message;
    const reply = message ? normalizeContent(message as ChatCompletionMessage) : '';

    if (reply) {
      await appendGrokHistory(guildId, userId, trimmed, reply);
      log.debug(`Grok reply success len=${reply.length} appended to history`);
    }
    if (!reply) {
      log.warn('Grok response had no message content');
      return "I didn't get a clear reply. Want to try again?";
    }
    return reply;
  } catch (error) {
    log.warn(`Grok request failed: ${(error as Error).message}`);
    return "I couldn't reach Grok right now. Try again in a moment.";
  }
}

/** Clear conversation history for a user (e.g. when leaving conversation mode). */
export async function clearGrokConversation(guildId: string, userId: string): Promise<void> {
  await clearGrokHistory(guildId, userId);
  log.debug(`Cleared Grok history for ${guildId}:${userId}`);
}
