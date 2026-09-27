jest.mock('ws', () =>
  jest.requireActual<typeof import('./helpers/fakeWs')>('./helpers/fakeWs').wsModuleMock()
);

jest.mock('@rainbot/shared', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));
jest.mock('../../redis', () => ({
  getGrokPersona: jest.fn().mockResolvedValue(null),
  getGrokVoice: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../prompts', () => ({
  getVoiceAgentInstructions: jest.fn().mockResolvedValue('INSTRUCTIONS'),
}));
jest.mock('../../audio/utils', () => ({
  resample48kStereoTo24kMono: (b: Buffer) => b,
}));
jest.mock('../tools', () => ({ VOICE_AGENT_MUSIC_TOOLS: [] }));

import { flush, resetSockets, sockets } from './helpers/fakeWs';

describe('Voice Agent session config', () => {
  let createdClients: Array<{ close(): void }> = [];

  beforeEach(() => {
    jest.resetModules();
    resetSockets();
    createdClients = [];
    process.env['GROK_API_KEY'] = 'test-key';
    process.env['VOICE_TRIGGER_WORD'] = 'evan';
  });

  afterEach(() => {
    // Close all clients created in the test to clear the 15-second heartbeat interval
    for (const client of createdClients) {
      if (client) {
        client.close();
      }
    }
    createdClients = [];
  });

  const connect = async () => {
    const { createGrokVoiceAgentClient } = await import('../grokVoiceAgent');
    const client = createGrokVoiceAgentClient('g1', 'u1', { onAudioDone: jest.fn() });
    if (client) {
      createdClients.push(client);
    }
    const sock = sockets()[0];
    sock.emit('open');
    await flush();
    return { client, sock };
  };

  it('disables server VAD so xAI never auto-responds', async () => {
    const { sock } = await connect();
    const update = sock.sentOfType('session.update')[0] as {
      session: { turn_detection: unknown };
    };
    expect(update.session.turn_detection).toBeNull();
  });

  it('requests input transcription so the wake word can be read off the socket', async () => {
    const { sock } = await connect();
    const update = sock.sentOfType('session.update')[0] as {
      session: { audio: { input: { transcription?: { model: string } } } };
    };
    expect(update.session.audio.input.transcription?.model).toBe('grok-transcribe');
  });

  it('never sets idle_timeout_ms, which would re-engage the user unprompted', async () => {
    const { sock } = await connect();
    const update = sock.sentOfType('session.update')[0] as { session: Record<string, unknown> };
    expect(update.session['idle_timeout_ms']).toBeUndefined();
  });
});
