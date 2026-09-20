const mockLexicalSearch = jest.fn();
const mockVectorSearch = jest.fn();
const mockGetAnalysisFor = jest.fn();
const mockEmbedText = jest.fn();

jest.mock('../analysisRepo', () => ({
  lexicalSearch: (...a: unknown[]) => mockLexicalSearch(...a),
  vectorSearch: (...a: unknown[]) => mockVectorSearch(...a),
  getAnalysisFor: (...a: unknown[]) => mockGetAnalysisFor(...a),
}));
jest.mock('../embeddings', () => ({
  embedText: (...a: unknown[]) => mockEmbedText(...a),
  shouldUseSemantic: jest.requireActual('../embeddings').shouldUseSemantic,
}));

import { searchSounds, matchNamesLocally } from '../soundSearch';

const library = [{ name: 'airhorn.ogg' }, { name: 'yougay.ogg' }, { name: 'trombone.ogg' }];

beforeEach(() => {
  jest.clearAllMocks();
  mockLexicalSearch.mockResolvedValue([]);
  mockVectorSearch.mockResolvedValue([]);
  mockGetAnalysisFor.mockResolvedValue(new Map());
  mockEmbedText.mockResolvedValue(null);
});

describe('matchNamesLocally', () => {
  it('matches a spaced query against a squashed filename', () => {
    expect(matchNamesLocally('air horn', library)).toEqual(['airhorn.ogg']);
  });

  it('ranks a prefix match ahead of a mid-string match', () => {
    const sounds = [{ name: 'loudairhorn.ogg' }, { name: 'airhorn.ogg' }];
    expect(matchNamesLocally('air', sounds)[0]).toBe('airhorn.ogg');
  });

  it('matches against a display name too', () => {
    const sounds = [{ name: 'xyz.ogg', displayName: 'Sad Trombone' }];
    expect(matchNamesLocally('trombone', sounds)).toEqual(['xyz.ogg']);
  });

  it('returns everything for an empty query', () => {
    expect(matchNamesLocally('', library)).toHaveLength(3);
  });
});

describe('searchSounds', () => {
  it('finds a sound by filename with no database and no embeddings', async () => {
    const results = await searchSounds({ query: 'air horn', sounds: library });
    expect(results[0]?.name).toBe('airhorn.ogg');
    expect(results[0]?.matchedOn).toBe('name');
  });

  it('never calls out for embeddings when a name match already succeeded', async () => {
    await searchSounds({ query: 'airhorn', sounds: library });
    expect(mockEmbedText).not.toHaveBeenCalled();
  });

  it('runs a semantic pass when lexical matching found nothing', async () => {
    mockEmbedText.mockResolvedValue([0.1, 0.2]);
    mockVectorSearch.mockResolvedValue(['trombone.ogg']);
    mockGetAnalysisFor.mockResolvedValue(
      new Map([
        [
          'trombone.ogg',
          {
            soundName: 'trombone.ogg',
            kind: 'sound',
            transcript: null,
            caption: 'a descending sad trombone',
            tags: ['trombone'],
            searchDoc: 'x',
            sourceSize: 1,
            model: 'm',
          },
        ],
      ])
    );

    const results = await searchSounds({ query: 'disappointment noise', sounds: library });
    expect(results[0]?.name).toBe('trombone.ogg');
    expect(results[0]?.matchedOn).toBe('semantic');
    expect(results[0]?.snippet).toBe('a descending sad trombone');
  });

  it('skips the semantic pass when allowSemantic is false', async () => {
    await searchSounds({ query: 'disappointment noise', sounds: library, allowSemantic: false });
    expect(mockEmbedText).not.toHaveBeenCalled();
  });

  it('shows the transcript as the snippet for a speech match', async () => {
    mockLexicalSearch.mockResolvedValue(['yougay.ogg']);
    mockGetAnalysisFor.mockResolvedValue(
      new Map([
        [
          'yougay.ogg',
          {
            soundName: 'yougay.ogg',
            kind: 'speech',
            transcript: 'you are gay',
            caption: 'a man shouting',
            tags: [],
            searchDoc: 'x',
            sourceSize: 1,
            model: 'm',
          },
        ],
      ])
    );

    const results = await searchSounds({ query: 'you are gay', sounds: library });
    const hit = results.find((result) => result.name === 'yougay.ogg');
    expect(hit?.snippet).toBe('you are gay');
    expect(hit?.matchedOn).toBe('transcript');
  });

  it('treats an empty transcript exactly like an absent one', async () => {
    // A clip can be kind='speech' with transcript='' - speech was heard, no
    // usable words came back. The read path must not offer an empty snippet
    // or claim the match came from a transcript with no words in it.
    mockLexicalSearch.mockResolvedValue(['yougay.ogg']);
    const analysis = {
      soundName: 'yougay.ogg',
      kind: 'speech',
      caption: 'a man shouting a farewell',
      tags: [],
      searchDoc: 'x',
      sourceSize: 1,
      model: 'm',
    };

    for (const transcript of ['', null]) {
      mockGetAnalysisFor.mockResolvedValue(new Map([['yougay.ogg', { ...analysis, transcript }]]));

      const results = await searchSounds({ query: 'farewell', sounds: library });
      const hit = results.find((result) => result.name === 'yougay.ogg');

      expect(hit?.matchedOn).toBe('caption');
      expect(hit?.snippet).toBe('a man shouting a farewell');
    }
  });

  it('never returns a sound absent from the supplied library', async () => {
    mockLexicalSearch.mockResolvedValue(['deleted.ogg']);
    const results = await searchSounds({ query: 'deleted', sounds: library });
    expect(results.map((result) => result.name)).not.toContain('deleted.ogg');
  });

  it('returns everything for an empty query', async () => {
    const results = await searchSounds({ query: '', sounds: library });
    expect(results).toHaveLength(3);
  });

  it('honours the limit', async () => {
    const results = await searchSounds({ query: '', sounds: library, limit: 2 });
    expect(results).toHaveLength(2);
  });

  it('survives a lexical search that throws', async () => {
    mockLexicalSearch.mockRejectedValue(new Error('db down'));
    const results = await searchSounds({ query: 'air horn', sounds: library });
    expect(results[0]?.name).toBe('airhorn.ogg');
  });
});
