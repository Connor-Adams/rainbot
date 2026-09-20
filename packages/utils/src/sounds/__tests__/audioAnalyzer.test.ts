import { parseDescription } from '../audioAnalyzer';

describe('parseDescription', () => {
  it('parses a well-formed reply', () => {
    const parsed = parseDescription(
      JSON.stringify({
        kind: 'sound',
        caption: 'a loud brassy air horn blast',
        tags: ['air horn', 'blast'],
      })
    );
    expect(parsed).toEqual({
      kind: 'sound',
      caption: 'a loud brassy air horn blast',
      tags: ['air horn', 'blast'],
    });
  });

  it('unwraps a fenced code block', () => {
    const parsed = parseDescription(
      '```json\n{"kind":"speech","caption":"a man yells","tags":[]}\n```'
    );
    expect(parsed?.kind).toBe('speech');
  });

  it('rejects an unknown kind', () => {
    expect(parseDescription(JSON.stringify({ kind: 'music', caption: 'x', tags: [] }))).toBeNull();
  });

  it('returns null for unparseable text', () => {
    expect(parseDescription('I could not process that audio.')).toBeNull();
  });

  it('coerces a missing tags field to an empty array', () => {
    expect(parseDescription(JSON.stringify({ kind: 'sound', caption: 'a thud' }))?.tags).toEqual(
      []
    );
  });

  it('drops non-string tags and trims the rest', () => {
    const parsed = parseDescription(
      JSON.stringify({ kind: 'sound', caption: 'a thud', tags: ['  bass  ', 42, null] })
    );
    expect(parsed?.tags).toEqual(['bass']);
  });

  it('caps runaway tag lists at eight', () => {
    const tags = Array.from({ length: 20 }, (_, i) => `tag${i}`);
    expect(
      parseDescription(JSON.stringify({ kind: 'sound', caption: 'x', tags }))?.tags
    ).toHaveLength(8);
  });
});

describe('describeAudio', () => {
  afterEach(() => jest.resetModules());

  it('returns null when no API key is configured', async () => {
    jest.resetModules();
    jest.doMock('../../config', () => ({
      loadConfig: () => ({ openaiApiKey: undefined, soundCaptionModel: 'test-model' }),
    }));

    const { describeAudio } = require('../audioAnalyzer');
    await expect(describeAudio(Buffer.from('x'), 'a.ogg')).resolves.toBeNull();
  });
});
