/**
 * Grok conversation via xAI Chat Completions API (conversational).
 * Keeps message history in Redis for multi-turn context.
 * Set LOG_LEVEL=debug for verbose request/response logging.
 */
import { createLogger } from '@rainbot/shared';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { withSpan, RainbotAttr } from '@rainbot/observability/node';
import { GROK_API_KEY, GROK_MODEL, GROK_ENABLED } from '../config';
import { getGrokHistory, appendGrokHistory, clearGrokHistory } from '../redis';
import { getSystemPromptForChat } from '../prompts';

const log = createLogger('GROK');
const XAI_BASE = 'https://api.x.ai/v1';

interface ChatCompletionMessage {
  role: string;
  content: string | Array<{ type: string; text?: string }>;
}

interface ChatCompletionChoice {
  message?: { role?: string; content?: string };
  index?: number;
}

interface ChatCompletionUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface ChatCompletionResponse {
  choices?: ChatCompletionChoice[];
  id?: string;
  usage?: ChatCompletionUsage;
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
  userMessage: string,
  personaId?: string
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

  const systemPrompt = await getSystemPromptForChat(personaId);
  const history = await getGrokHistory(guildId, userId);
  log.debug(`History messages: ${history.length}`);

  // Filter out any system messages from history (we always add our own fresh system prompt)
  // and ensure we only include user/assistant pairs
  const filteredHistory = history.filter((m) => m.role !== 'system');

  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
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
      `POST ${url} model=${GROK_MODEL} messages=${messages.length} systemPromptLength=${systemPrompt.length}`
    );
    log.debug(`System prompt preview: ${systemPrompt.substring(0, 100)}...`);

    // getGrokReply never throws on an API failure — it always resolves to a
    // friendly string (see the two branches below), so withSpan's own
    // exception-based error detection would never see either failure as an
    // error. Mark the active span ERROR explicitly inside the withSpan
    // callback (where it's still the active span) whenever that's the case.
    //
    // Named grok.chat.completion (not grok.converse) because this is the
    // STT/text fallback path via xAI's Chat Completions API, not the
    // realtime Voice Agent (apps/pranjeet/src/voice-agent/grokVoiceAgent.ts)
    // that users actually talk to during a live conversation — that path is
    // still untraced and needs its own websocket span-lifecycle design.
    // grok.converse is reserved for that eventual realtime span.
    const { reply, httpFailed } = await withSpan(
      'grok.chat.completion',
      { [RainbotAttr.grokModel]: GROK_MODEL, [RainbotAttr.guildId]: guildId },
      async (): Promise<{ reply: string; httpFailed: boolean }> => {
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errText = await res.text();
          log.warn(`Grok API error ${res.status}: ${errText}`);
          trace
            .getActiveSpan()
            ?.setStatus({ code: SpanStatusCode.ERROR, message: `xAI API responded ${res.status}` });
          return { reply: '', httpFailed: true };
        }

        const data = (await res.json()) as ChatCompletionResponse;
        const choice = data.choices?.[0];
        const message = choice?.message;
        const parsedReply = message ? normalizeContent(message as ChatCompletionMessage) : '';

        const span = trace.getActiveSpan();
        if (data.usage) {
          if (typeof data.usage.prompt_tokens === 'number') {
            span?.setAttribute(RainbotAttr.grokPromptTokens, data.usage.prompt_tokens);
          }
          if (typeof data.usage.completion_tokens === 'number') {
            span?.setAttribute(RainbotAttr.grokCompletionTokens, data.usage.completion_tokens);
          }
          if (typeof data.usage.total_tokens === 'number') {
            span?.setAttribute(RainbotAttr.grokTotalTokens, data.usage.total_tokens);
          }
        }

        if (!parsedReply) {
          log.warn('Grok response had no message content');
          span?.setStatus({
            code: SpanStatusCode.ERROR,
            message: 'xAI returned no message content',
          });
        }

        return { reply: parsedReply, httpFailed: false };
      }
    );

    if (reply) {
      await appendGrokHistory(guildId, userId, trimmed, reply);
      log.debug(`Grok reply success len=${reply.length} appended to history`);
      return reply;
    }

    return httpFailed
      ? 'I had trouble thinking of a reply. Try again in a moment.'
      : "I didn't get a clear reply. Want to try again?";
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
