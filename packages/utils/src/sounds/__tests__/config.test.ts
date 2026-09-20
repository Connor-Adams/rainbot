describe('sound analysis config', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  it('defaults the caption and embedding models', () => {
    delete process.env['SOUND_CAPTION_MODEL'];
    delete process.env['SOUND_EMBEDDING_MODEL'];
    jest.resetModules();
     
    const { loadConfig } = require('../../config');
    const config = loadConfig(true);
    expect(config.soundCaptionModel).toBe('gpt-4o-audio-preview');
    expect(config.soundEmbeddingModel).toBe('text-embedding-3-small');
  });

  it('falls back from OPENAI_API_KEY to STT_API_KEY', () => {
    delete process.env['OPENAI_API_KEY'];
    process.env['STT_API_KEY'] = 'from-stt';
    jest.resetModules();
     
    const { loadConfig } = require('../../config');
    expect(loadConfig(true).openaiApiKey).toBe('from-stt');
  });

  it('is disabled when SOUND_ANALYSIS_ENABLED is false', () => {
    process.env['SOUND_ANALYSIS_ENABLED'] = 'false';
    jest.resetModules();
     
    const { loadConfig } = require('../../config');
    expect(loadConfig(true).soundAnalysisEnabled).toBe(false);
  });
});
