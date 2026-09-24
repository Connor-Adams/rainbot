// config.ts reads process.env at module load, so every case here resets the
// module registry and re-imports rather than mutating an already-loaded config.
const openAIConstructor = jest.fn();

jest.mock('openai', () => ({
  OpenAI: class {
    constructor(opts: unknown) {
      openAIConstructor(opts);
    }
  },
}));

jest.mock('@rainbot/worker-shared', () => ({ logErrorWithStack: jest.fn() }));

describe('initTTS OpenAI client construction', () => {
  const envKeys = ['TTS_API_KEY', 'OPENAI_API_KEY', 'TTS_BASE_URL', 'OPENAI_BASE_URL'];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    jest.resetModules();
    openAIConstructor.mockClear();
    for (const k of envKeys) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    process.env['TTS_PROVIDER'] = 'openai';
    process.env['TTS_API_KEY'] = 'test-key';
  });

  afterEach(() => {
    for (const k of envKeys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('sends no baseURL when none is configured, so the SDK default is used', async () => {
    const { initTTS } = await import('../index');
    await initTTS();

    expect(openAIConstructor).toHaveBeenCalledTimes(1);
    const opts = openAIConstructor.mock.calls[0][0] as Record<string, unknown>;
    expect(opts['apiKey']).toBe('test-key');
    expect(opts).not.toHaveProperty('baseURL');
  });

  it('routes through TTS_BASE_URL when set', async () => {
    process.env['TTS_BASE_URL'] = 'http://192.168.2.3:4000/v1';
    const { initTTS } = await import('../index');
    await initTTS();

    const opts = openAIConstructor.mock.calls[0][0] as Record<string, unknown>;
    expect(opts['baseURL']).toBe('http://192.168.2.3:4000/v1');
  });

  it('falls back to OPENAI_BASE_URL, matching how the API key resolves', async () => {
    process.env['OPENAI_BASE_URL'] = 'http://litellm:4000/v1';
    const { initTTS } = await import('../index');
    await initTTS();

    const opts = openAIConstructor.mock.calls[0][0] as Record<string, unknown>;
    expect(opts['baseURL']).toBe('http://litellm:4000/v1');
  });

  it('prefers TTS_BASE_URL over OPENAI_BASE_URL', async () => {
    process.env['TTS_BASE_URL'] = 'http://specific:4000/v1';
    process.env['OPENAI_BASE_URL'] = 'http://general:4000/v1';
    const { initTTS } = await import('../index');
    await initTTS();

    const opts = openAIConstructor.mock.calls[0][0] as Record<string, unknown>;
    expect(opts['baseURL']).toBe('http://specific:4000/v1');
  });
});
