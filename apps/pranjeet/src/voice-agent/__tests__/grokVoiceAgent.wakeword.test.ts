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

describe('wake-word gating', () => {
  beforeEach(() => {
    jest.resetModules();
    resetSockets();
    process.env['GROK_API_KEY'] = 'test-key';
    process.env['VOICE_TRIGGER_WORD'] = 'evan';
  });

  const connect = async () => {
    const mod = await import('../grokVoiceAgent');
    const client = mod.createGrokVoiceAgentClient('g1', 'u1', { onAudioDone: jest.fn() });
    const sock = sockets()[0];
    sock.emit('open');
    await flush();
    sock.serverSays({ type: 'session.updated' });
    return { client: client!, sock, mod };
  };

  it('commits and responds when the transcript starts with the wake word', async () => {
    const { client, sock } = await connect();
    sock.serverSays({
      type: 'conversation.item.input_audio_transcription.updated',
      transcript: 'Evan, what is the queue?',
    });
    await client.endUtterance();
    expect(sock.sentOfType('input_audio_buffer.commit')).toHaveLength(1);
    expect(sock.sentOfType('response.create')).toHaveLength(1);
  });

  it('commits but stays silent when the wake word is absent', async () => {
    const { client, sock } = await connect();
    sock.serverSays({
      type: 'conversation.item.input_audio_transcription.updated',
      transcript: 'so anyway I told him no',
    });
    await client.endUtterance();
    expect(sock.sentOfType('input_audio_buffer.commit')).toHaveLength(1);
    expect(sock.sentOfType('response.create')).toHaveLength(0);
  });

  it('stays silent when no transcript ever arrives', async () => {
    const { client, sock } = await connect();
    await client.endUtterance();
    expect(sock.sentOfType('response.create')).toHaveLength(0);
  });

  it('ignores leading punctuation and casing before the wake word', async () => {
    const { client, sock } = await connect();
    sock.serverSays({
      type: 'conversation.item.input_audio_transcription.updated',
      transcript: '  ...EVAN skip this song',
    });
    await client.endUtterance();
    expect(sock.sentOfType('response.create')).toHaveLength(1);
  });

  it('does not treat a wake word mid-sentence as being addressed', async () => {
    const { client, sock } = await connect();
    sock.serverSays({
      type: 'conversation.item.input_audio_transcription.updated',
      transcript: 'I was talking to Evan yesterday',
    });
    await client.endUtterance();
    expect(sock.sentOfType('response.create')).toHaveLength(0);
  });

  it('resets transcript state between utterances', async () => {
    const { client, sock } = await connect();
    sock.serverSays({
      type: 'conversation.item.input_audio_transcription.updated',
      transcript: 'Evan hello',
    });
    await client.endUtterance();
    await client.endUtterance();
    expect(sock.sentOfType('response.create')).toHaveLength(1);
    expect(sock.sentOfType('input_audio_buffer.commit')).toHaveLength(2);
  });

  it('accepts a cumulative transcript that arrives on the delta field', async () => {
    const { client, sock } = await connect();
    sock.serverSays({
      type: 'conversation.item.input_audio_transcription.updated',
      delta: 'Evan play something',
    });
    await client.endUtterance();
    expect(sock.sentOfType('response.create')).toHaveLength(1);
  });

  it('sends nothing before the session is configured', async () => {
    const mod = await import('../grokVoiceAgent');
    const client = mod.createGrokVoiceAgentClient('g1', 'u1', { onAudioDone: jest.fn() })!;
    const sock = sockets()[0];
    sock.emit('open');
    await flush();
    await client.endUtterance();
    expect(sock.sentOfType('input_audio_buffer.commit')).toHaveLength(0);
  });

  describe('isAddressed', () => {
    it('matches only at the start, after stripping punctuation', async () => {
      const { isAddressed } = await import('../grokVoiceAgent');
      expect(isAddressed('Evan, stop', 'evan')).toBe(true);
      expect(isAddressed('“evan” stop', 'evan')).toBe(true);
      expect(isAddressed('hey evan stop', 'evan')).toBe(false);
      expect(isAddressed('evanescence is a band', 'evan')).toBe(false);
      expect(isAddressed('', 'evan')).toBe(false);
    });

    it('treats an unset trigger word as never addressed, so it fails closed', async () => {
      const { isAddressed } = await import('../grokVoiceAgent');
      expect(isAddressed('anything at all', '')).toBe(false);
    });
  });
});
