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

  it('backfills embeddings from embedding_json after the ALTER succeeds', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await expect(detectVectorSupport()).resolves.toBe(true);

    const alterIndex = mockQuery.mock.calls.findIndex(([sql]) =>
      String(sql).includes('ALTER TABLE')
    );
    const backfillIndex = mockQuery.mock.calls.findIndex(([sql]) =>
      String(sql).includes('embedding_json::text::vector')
    );
    expect(alterIndex).toBeGreaterThanOrEqual(0);
    expect(backfillIndex).toBeGreaterThan(alterIndex);
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

  it('detects pgvector itself and writes the vector column, with no sweep first', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    // No detectVectorSupport() call here on purpose: this is the state every
    // freshly started process is in, and a redeploy must not silently stop
    // populating the vector column until someone runs a sweep.
    await upsertAnalysis(analysis, [0.1, 0.2]);

    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes('CREATE EXTENSION'))).toBe(
      true
    );
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes('::vector'))).toBe(true);
  });

  it('writes no vector column when pgvector is unavailable', async () => {
    mockQuery.mockImplementation(async (sql: string) =>
      String(sql).includes('CREATE EXTENSION') ? null : { rows: [] }
    );

    await upsertAnalysis(analysis, [0.1, 0.2]);

    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes('::vector'))).toBe(false);
  });

  it('detects only once across repeated writes', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    await upsertAnalysis(analysis, [0.1, 0.2]);
    await upsertAnalysis(analysis, [0.1, 0.2]);
    await upsertAnalysis(analysis, [0.1, 0.2]);

    const probes = mockQuery.mock.calls.filter(([sql]) =>
      String(sql).includes('CREATE EXTENSION')
    ).length;
    expect(probes).toBe(1);
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
    mockQuery.mockImplementation(async (sql: string) =>
      String(sql).includes('CREATE EXTENSION')
        ? null
        : {
            rows: [
              { sound_name: 'far.ogg', embedding_json: JSON.stringify([0, 1]) },
              { sound_name: 'near.ogg', embedding_json: JSON.stringify([1, 0]) },
            ],
          }
    );
    await expect(vectorSearch([1, 0], 10)).resolves.toEqual(['near.ogg', 'far.ogg']);
  });

  it('detects pgvector itself and uses the SQL path, with no sweep first', async () => {
    mockQuery.mockResolvedValue({ rows: [{ sound_name: 'near.ogg' }] });

    await expect(vectorSearch([1, 0], 10)).resolves.toEqual(['near.ogg']);

    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes('CREATE EXTENSION'))).toBe(
      true
    );
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes('embedding <=>'))).toBe(true);
  });

  it('detects once, not once per query', async () => {
    mockQuery.mockResolvedValue({ rows: [{ sound_name: 'near.ogg' }] });

    await vectorSearch([1, 0], 10);
    await vectorSearch([1, 0], 10);
    await vectorSearch([1, 0], 10);

    const probes = mockQuery.mock.calls.filter(([sql]) =>
      String(sql).includes('CREATE EXTENSION')
    ).length;
    expect(probes).toBe(1);
  });

  it('shares one probe between callers racing before detection finishes', async () => {
    mockQuery.mockResolvedValue({ rows: [{ sound_name: 'near.ogg' }] });

    await Promise.all([vectorSearch([1, 0], 10), vectorSearch([0, 1], 10)]);

    const probes = mockQuery.mock.calls.filter(([sql]) =>
      String(sql).includes('CREATE EXTENSION')
    ).length;
    expect(probes).toBe(1);
  });

  it('falls back to JS instead of throwing when the query layer rejects', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (String(sql).includes('CREATE EXTENSION')) throw new Error('permission denied');
      return { rows: [{ sound_name: 'near.ogg', embedding_json: JSON.stringify([1, 0]) }] };
    });

    await expect(vectorSearch([1, 0], 10)).resolves.toEqual(['near.ogg']);
    expect(isVectorAvailable()).toBe(false);
  });
});

describe('getAnalysisSizes', () => {
  it('maps sound names to their recorded source size', async () => {
    mockQuery.mockResolvedValue({ rows: [{ sound_name: 'a.ogg', source_size: '99' }] });
    const sizes = await getAnalysisSizes();
    expect(sizes.get('a.ogg')).toBe(99);
  });
});
