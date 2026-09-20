import { shouldUseSemantic } from '../embeddings';

describe('shouldUseSemantic', () => {
  it('declines a query shorter than four characters', () => {
    expect(shouldUseSemantic('air', 0)).toBe(false);
  });

  it('declines when lexical matching already found plenty', () => {
    expect(shouldUseSemantic('air horn', 9)).toBe(false);
  });

  it('engages when a long enough query found too little', () => {
    expect(shouldUseSemantic('angry yelling', 1)).toBe(true);
  });

  it('declines an empty query', () => {
    expect(shouldUseSemantic('', 0)).toBe(false);
  });

  it('counts characters after trimming', () => {
    expect(shouldUseSemantic('  ai  ', 0)).toBe(false);
  });
});

describe('embedText', () => {
  afterEach(() => jest.resetModules());

  it('returns null when no API key is configured', async () => {
    jest.resetModules();
    jest.doMock('../../config', () => ({
      loadConfig: () => ({ openaiApiKey: undefined, soundEmbeddingModel: 'test-model' }),
    }));

    const { embedText } = require('../embeddings');
    await expect(embedText('air horn')).resolves.toBeNull();
  });

  it('returns null for empty text without calling out', async () => {
    jest.resetModules();
    jest.doMock('../../config', () => ({
      loadConfig: () => ({ openaiApiKey: 'key', soundEmbeddingModel: 'test-model' }),
    }));

    const { embedText } = require('../embeddings');
    await expect(embedText('   ')).resolves.toBeNull();
  });
});
