import { buildVoiceInstructions, VOICE_BREVITY, VOICE_ACCENT_CRITICAL } from '../voice';

const wordCount = (s: string) => s.trim().split(/\s+/).length;

describe('buildVoiceInstructions', () => {
  it('states the 10-word cap and the 5-word target', () => {
    const out = buildVoiceInstructions('You are terse.', false);
    expect(out).toContain('10 words');
    expect(out).toContain('5 words');
  });

  it('states the limit in words only, with no sentence-count clause', () => {
    const out = buildVoiceInstructions('You are terse.', true);
    // "One sentence. Never two." was removed: the behavioural examples and
    // <speech_rhythm_for_voice> both ask for multi-sentence rhythm, so the clause
    // contradicted them, and the project states its limit in words.
    expect(out).not.toMatch(/never two/i);
    expect(out).not.toMatch(/one sentence/i);
  });

  it('never phrases the cap as "under 10 words", which would mean nine', () => {
    const out = buildVoiceInstructions('You are terse.', true);
    expect(out).not.toMatch(/under 10 words/i);
    expect(out).toMatch(/within 10 words/i);
  });

  it('puts the brevity rule before the accent instruction', () => {
    const out = buildVoiceInstructions('You are terse.', false);
    expect(out.indexOf(VOICE_BREVITY.trim())).toBeLessThan(out.indexOf(VOICE_ACCENT_CRITICAL));
  });

  it('keeps the accent instruction under 30 words at each end', () => {
    const out = buildVoiceInstructions('You are terse.', false);
    const accentLines = out.split('\n').filter((l) => /accent/i.test(l));
    expect(accentLines.length).toBeGreaterThan(0);
    for (const line of accentLines) expect(wordCount(line)).toBeLessThanOrEqual(30);
  });

  it('keeps the cap when the persona body is empty (fallback path)', () => {
    const out = buildVoiceInstructions('   ', false);
    expect(out).toContain('10 words');
  });

  it('keeps the cap when the tools note is appended', () => {
    const out = buildVoiceInstructions('You are terse.', true);
    expect(out).toContain('10 words');
    expect(out).toContain('music tools');
  });

  it('never returns an empty string', () => {
    expect(buildVoiceInstructions('', false).length).toBeGreaterThan(0);
  });
});
