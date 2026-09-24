const mockSearchSounds = jest.fn();
const mockListSounds = jest.fn();
const mockQuery = jest.fn();

// api.ts imports all three from @rainbot/utils at module load, so all three
// must exist on the mock even though only searchSounds is exercised here.
jest.mock('@rainbot/utils', () => ({
  searchSounds: (...a: unknown[]) => mockSearchSounds(...a),
  analyzeSound: jest.fn(),
  sweepAnalyzeSounds: jest.fn(),
}));
jest.mock('@rainbot/utils/storage', () => ({
  listSounds: (...a: unknown[]) => mockListSounds(...a),
}));
jest.mock('@rainbot/utils/database', () => ({ query: (...a: unknown[]) => mockQuery(...a) }));

import { searchSoundsHandler } from '../api';

function makeRes() {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  return { res: { status, json } as never, json, status };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListSounds.mockResolvedValue([{ name: 'airhorn.ogg', size: 1, createdAt: new Date() }]);
  mockQuery.mockResolvedValue({ rows: [] });
  mockSearchSounds.mockResolvedValue([
    { name: 'airhorn.ogg', score: 1, matchedOn: 'name', snippet: null },
  ]);
});

describe('searchSoundsHandler', () => {
  it('returns ranked results for a query', async () => {
    const { res, json } = makeRes();
    await searchSoundsHandler({ query: { q: 'air horn' } } as never, res);
    expect(json).toHaveBeenCalledWith({
      results: [{ name: 'airhorn.ogg', score: 1, matchedOn: 'name', snippet: null }],
    });
  });

  it('treats a missing q as an empty query rather than an error', async () => {
    const { res, status } = makeRes();
    await searchSoundsHandler({ query: {} } as never, res);
    expect(status).not.toHaveBeenCalledWith(400);
  });

  it('passes display names from customizations into the search', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ sound_name: 'airhorn.ogg', display_name: 'Air Horn', emoji: null }],
    });
    const { res } = makeRes();
    await searchSoundsHandler({ query: { q: 'air' } } as never, res);

    const [options] = mockSearchSounds.mock.calls[0] as [
      { sounds: Array<{ displayName?: string }> },
    ];
    expect(options.sounds[0]?.displayName).toBe('Air Horn');
  });

  it('clamps an absurd limit', async () => {
    const { res } = makeRes();
    await searchSoundsHandler({ query: { q: 'air', limit: '9999' } } as never, res);
    const [options] = mockSearchSounds.mock.calls[0] as [{ limit: number }];
    expect(options.limit).toBeLessThanOrEqual(100);
  });

  it('returns 500 when listing sounds fails', async () => {
    mockListSounds.mockRejectedValue(new Error('storage down'));
    const { res, status } = makeRes();
    await searchSoundsHandler({ query: { q: 'air' } } as never, res);
    expect(status).toHaveBeenCalledWith(500);
  });
});
