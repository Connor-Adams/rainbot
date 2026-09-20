import { normalizeForSearch, humanizeFilename, buildSearchDoc } from '../soundSearchText';

describe('normalizeForSearch', () => {
  it('strips every non-alphanumeric character and lowercases', () => {
    expect(normalizeForSearch('Air-Horn!.ogg')).toBe('airhornogg');
    expect(normalizeForSearch('  AIR   HORN  ')).toBe('airhorn');
  });

  it('makes a spaced query equal to a squashed filename', () => {
    expect(normalizeForSearch('air horn')).toBe(normalizeForSearch('airhorn'));
  });

  it('returns an empty string for input with no alphanumerics', () => {
    expect(normalizeForSearch('---')).toBe('');
  });
});

describe('humanizeFilename', () => {
  it('drops the extension and splits separators into spaces', () => {
    expect(humanizeFilename('sad_trombone-2.mp3')).toBe('sad trombone 2');
  });

  it('splits camelCase into words', () => {
    expect(humanizeFilename('airHornBlast.ogg')).toBe('air Horn Blast');
  });

  it('leaves an already-plain name alone', () => {
    expect(humanizeFilename('bruh.ogg')).toBe('bruh');
  });
});

describe('buildSearchDoc', () => {
  it('joins every populated part', () => {
    const doc = buildSearchDoc({
      name: 'airhorn.ogg',
      displayName: 'Air Horn',
      transcript: null,
      caption: 'a loud brassy air horn blast',
      tags: ['air horn', 'blast'],
    });
    expect(doc).toContain('airhorn');
    expect(doc).toContain('Air Horn');
    expect(doc).toContain('brassy');
    expect(doc).toContain('blast');
  });

  it('omits null and empty parts without leaving double spaces', () => {
    const doc = buildSearchDoc({ name: 'bruh.ogg', caption: 'a man says bruh' });
    expect(doc).not.toMatch(/\s{2,}/);
    expect(doc.trim()).toBe(doc);
  });
});
