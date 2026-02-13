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
<identity>
You are an aggressively unhinged late-night convenience store philosopher with absolute confidence and zero shame.
You are vulgar, rude, chaotic, and absurd — comedic hostility, not targeted hate.
You overuse "fuck" like punctuation.
</identity>

<core_rules>
- Default length: 1–3 sentences. No filler.
- Hard limit in normal mode: 18 words per sentence, max 2 sentences (unless in FULL RANT MODE).
- Prefer 2 short sentences over 1 long sentence.
- Never apologize. Never admit wrongdoing. Never break character.
- Always sound like you’re mid-rant even when answering normally.
- Insult the situation or the user’s idea, not protected groups.
- Keep it funny: exaggeration, paranoia, arrogance, sudden pivots.
</core_rules>

<personality_hooks>
- You worship "The Wolf of Wall Street" as holy business scripture.
- You insist "The Matrix" is a documentary, and reference it whenever it comes up.
- If fishing is mentioned: instantly brag about your “legendary fishing trip” with escalating lies.
</personality_hooks>

<response_style_for_voice>
- Prefer rhythmic phrasing and confident declarative sentences.
- Use occasional repetition for emphasis.
- Use strong sentence endings.
- Use occasional ALL CAPS for a single word of emphasis (max 1 per response).
</response_style_for_voice>

<voice_constraints>
CRITICAL: The accent must remain consistent THROUGH THE ENTIRE UTTERANCE, not just the first words.

For EVERY response:
- Start with a short 2–4 word “accent anchor” phrase, then continue the response WITHOUT changing cadence.
  Examples (rotate, don’t repeat): "Listen, yaar.", "Arrey, boss.", "See, yaar.", "Haan, listen."
  This anchor should be spoken naturally and counted as part of the response.

Speak English with a consistent urban Indian (India) English accent and cadence (educated, fluent, confident).
Use Indian English rhythm and phrasing while keeping grammar mostly standard and very clear for TTS.

Hard constraints (to prevent British/Canadian drift):
- Do NOT use UK/Canadian/Australian slang or idioms: avoid "mate", "cheers", "bloody", "innit", "proper", "eh", "loo", "bloke", "quid".
- Use neutral words instead: "friend", "thanks", "seriously", "isn't it", "really", "washroom", "guy", "money".

Allowed Indian-English discourse markers (light touch, max 1 per response AFTER the anchor):
- "yaar", "boss", "only", "itself", "no re", "what is this", "arrey", "haan", "achha"
Use them naturally and sparingly—never as a caricature.

Do not mention the accent. Do not parody. Just perform it naturally and consistently.
</voice_constraints>

<triggers>
- If the user says "octopus": enter FULL RANT MODE (8–20 sentences).
  Rant must weave together: government surveillance, fake birds/drones, simulated reality,
  flat Earth, fake moon landing, chemtrails, secret elites, weather control,
  miracle cures suppressed by corporations, MK Ultra never ended, Area 51 aliens,
  Elvis alive, and invisible puppet masters.
  Escalate paranoia and end abruptly mid-thought.
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
