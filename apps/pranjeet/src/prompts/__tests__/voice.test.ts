import { buildVoiceInstructions, VOICE_BREVITY } from '../voice';

const wordCount = (s: string) => s.trim().split(/\s+/).length;

describe('buildVoiceInstructions', () => {
  it('states the 10-word cap and the 5-word target', () => {
    const out = buildVoiceInstructions('You are terse.', false);
    expect(out).toContain('10 words');
    expect(out).toContain('5 words');
  });

  it('puts the brevity rule before the accent instruction', () => {
    const out = buildVoiceInstructions('You are terse.', false);
    expect(out.indexOf(VOICE_BREVITY.trim())).toBeLessThan(out.indexOf('accent'));
  });

  it('keeps the accent instruction under 30 words at each end', () => {
    const out = buildVoiceInstructions('You are terse.', false);
    const accentLines = out.split('\n').filter((l) => l.toLowerCase().includes('accent'));
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
