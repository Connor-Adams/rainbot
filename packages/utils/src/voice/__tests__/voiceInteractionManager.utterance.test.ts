import type { Client } from 'discord.js';
import { VoiceInteractionManager } from '../voiceInteractionManager';

const fakeClient = {} as Client;

/**
 * startListening throws unless the guild has state (enableForGuild creates it, no
 * I/O), and it dereferences connection.joinConfig.channelId then subscribes to
 * connection.receiver. The returned stream only needs .pipe() — nothing reads it
 * here. The manager's STT provider falls back to a mock when no key is set, so
 * constructing it without credentials is safe.
 */
const fakeConnection = () =>
  ({
    joinConfig: { channelId: 'c1' },
    receiver: { subscribe: () => ({ pipe: () => undefined }) },
    state: { status: 'ready' },
  }) as never;

/** Seed a voice-agent client by pushing one chunk through with conversation mode on. */
async function seed(endUtterance: jest.Mock) {
  const agent = { sendAudio: jest.fn(), close: jest.fn(), endUtterance };
  const mgr = new VoiceInteractionManager(fakeClient, {
    enabled: true,
    getConversationMode: async () => true,
    createVoiceAgentClient: () => agent,
  });
  await mgr.enableForGuild('g1');
  await mgr.startListening('u1', 'g1', fakeConnection());
  await mgr.processAudioChunk({
    guildId: 'g1',
    userId: 'u1',
    timestamp: Date.now(),
    buffer: Buffer.alloc(200),
    sequence: 0,
  });
  return { mgr, agent };
}

describe('onUtteranceEnd', () => {
  it('ends the utterance on the cached voice-agent client', async () => {
    const endUtterance = jest.fn().mockResolvedValue(undefined);
    const { mgr, agent } = await seed(endUtterance);
    expect(agent.sendAudio).toHaveBeenCalledTimes(1);
    await mgr.onUtteranceEnd('g1', 'u1');
    expect(endUtterance).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when no voice-agent client exists for that user', async () => {
    const mgr = new VoiceInteractionManager(fakeClient, { enabled: true });
    await mgr.enableForGuild('g1');
    await expect(mgr.onUtteranceEnd('g1', 'nobody')).resolves.toBeUndefined();
  });

  it('swallows an endUtterance failure so the audio subscription survives', async () => {
    const endUtterance = jest.fn().mockRejectedValue(new Error('socket gone'));
    const { mgr } = await seed(endUtterance);
    await expect(mgr.onUtteranceEnd('g1', 'u1')).resolves.toBeUndefined();
  });
});
