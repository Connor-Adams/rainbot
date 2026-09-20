const mockQuery = jest.fn();

jest.mock('../../database', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

import {
  detectVectorSupport,
  isVectorAvailable,
  resetVectorSupportCache,
  upsertAnalysis,
  lexicalSearch,
  vectorSearch,
  getAnalysisSizes,
} from '../analysisRepo';
import type { SoundAnalysis } from '../types';

const analysis: SoundAnalysis = {
  soundName: 'airhorn.ogg',
  kind: 'sound',
  transcript: null,
  caption: 'a loud brassy air horn blast',
  tags: ['air horn', 'blast'],
  searchDoc: 'airhorn.ogg airhorn a loud brassy air horn blast air horn blast',
  sourceSize: 1234,
  model: 'gpt-4o-audio-preview',
};

beforeEach(() => {
  mockQuery.mockReset();
  resetVectorSupportCache();
});

describe('detectVectorSupport', () => {
  it('reports true when the extension is created', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await expect(detectVectorSupport()).resolves.toBe(true);
    expect(isVectorAvailable()).toBe(true);
  });

  it('reports false when the extension cannot be created', async () => {
    mockQuery.mockResolvedValue(null);
    await expect(detectVectorSupport()).resolves.toBe(false);
    expect(isVectorAvailable()).toBe(false);
  });
});

describe('upsertAnalysis', () => {
  it('always writes the JSON embedding', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await upsertAnalysis(analysis, [0.1, 0.2]);

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO sound_analysis');
    expect(params).toContain('airhorn.ogg');
    expect(params).toContainEqual(JSON.stringify([0.1, 0.2]));
  });

  it('writes the pgvector column only once support is detected', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await upsertAnalysis(analysis, [0.1, 0.2]);
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes('::vector'))).toBe(false);

    await detectVectorSupport();
    mockQuery.mockClear();
    mockQuery.mockResolvedValue({ rows: [] });
    await upsertAnalysis(analysis, [0.1, 0.2]);
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes('::vector'))).toBe(true);
  });

  it('tolerates a null embedding', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await expect(upsertAnalysis(analysis, null)).resolves.toBeUndefined();
  });
});

describe('lexicalSearch', () => {
  it('returns names in the order the database ranked them', async () => {
    mockQuery.mockResolvedValue({ rows: [{ sound_name: 'a.ogg' }, { sound_name: 'b.ogg' }] });
    await expect(lexicalSearch('air horn', 25)).resolves.toEqual(['a.ogg', 'b.ogg']);
  });

  it('returns an empty list when the database is unavailable', async () => {
    mockQuery.mockResolvedValue(null);
    await expect(lexicalSearch('air horn', 25)).resolves.toEqual([]);
  });

  it('passes both the raw and the normalized query', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await lexicalSearch('Air Horn', 25);
    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params).toContain('Air Horn');
    expect(params).toContain('airhorn');
  });
});

describe('vectorSearch', () => {
  it('returns an empty list when the database is unavailable', async () => {
    mockQuery.mockResolvedValue(null);
    await expect(vectorSearch([0.1], 10)).resolves.toEqual([]);
  });

  it('ranks by cosine in JS when pgvector is absent', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { sound_name: 'far.ogg', embedding_json: JSON.stringify([0, 1]) },
        { sound_name: 'near.ogg', embedding_json: JSON.stringify([1, 0]) },
      ],
    });
    await expect(vectorSearch([1, 0], 10)).resolves.toEqual(['near.ogg', 'far.ogg']);
  });
});

describe('getAnalysisSizes', () => {
  it('maps sound names to their recorded source size', async () => {
    mockQuery.mockResolvedValue({ rows: [{ sound_name: 'a.ogg', source_size: '99' }] });
    const sizes = await getAnalysisSizes();
    expect(sizes.get('a.ogg')).toBe(99);
  });
});
