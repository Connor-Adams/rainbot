import { trimHallucinations } from '../speechTranscript';

describe('trimHallucinations', () => {
  it('keeps confident speech', () => {
    const text = trimHallucinations([
      { text: ' you are gay', no_speech_prob: 0.01, avg_logprob: -0.2 },
    ]);
    expect(text).toBe('you are gay');
  });

  it('drops segments Whisper itself flags as probably silence', () => {
    const text = trimHallucinations([
      { text: 'real words', no_speech_prob: 0.1, avg_logprob: -0.3 },
      { text: 'Thank you.', no_speech_prob: 0.92, avg_logprob: -0.4 },
    ]);
    expect(text).toBe('real words');
  });

  it('drops segments with very low average confidence', () => {
    const text = trimHallucinations([{ text: 'mumble', no_speech_prob: 0.1, avg_logprob: -2.5 }]);
    expect(text).toBe('');
  });

  it('drops known hallucination boilerplate even when confidently scored', () => {
    const text = trimHallucinations([
      { text: 'Subtitles by the Amara.org community', no_speech_prob: 0.01, avg_logprob: -0.1 },
    ]);
    expect(text).toBe('');
  });

  it('matches hallucination boilerplate case-insensitively', () => {
    const text = trimHallucinations([
      { text: 'thanks for watching!', no_speech_prob: 0.01, avg_logprob: -0.1 },
    ]);
    expect(text).toBe('');
  });

  it('joins surviving segments with single spaces', () => {
    const text = trimHallucinations([
      { text: ' hello ', no_speech_prob: 0.01, avg_logprob: -0.2 },
      { text: ' world ', no_speech_prob: 0.01, avg_logprob: -0.2 },
    ]);
    expect(text).toBe('hello world');
  });

  it('treats missing confidence fields as acceptable', () => {
    expect(trimHallucinations([{ text: 'bruh' }])).toBe('bruh');
  });

  it('returns an empty string for no segments', () => {
    expect(trimHallucinations([])).toBe('');
  });
});

describe('transcribeSpeech', () => {
  afterEach(() => jest.resetModules());

  it('returns null when no API key is configured', async () => {
    jest.resetModules();
    jest.doMock('../../config', () => ({ loadConfig: () => ({ openaiApiKey: undefined }) }));
    const { transcribeSpeech } = require('../speechTranscript');
    await expect(transcribeSpeech(Buffer.from('x'), 'a.ogg')).resolves.toBeNull();
  });
});
