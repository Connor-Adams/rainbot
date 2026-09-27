import { defaultPersona } from '../personas/default';

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

describe('default persona length discipline', () => {
  it('states the word cap, not a sentence count', () => {
    expect(defaultPersona.systemPrompt).toContain('10 words');
    expect(defaultPersona.systemPrompt).not.toMatch(/1[-–]4 sentences/);
  });

  it('keeps every behavioural example within the 10-word cap', () => {
    const block = defaultPersona.systemPrompt.match(
      /<behavioral_examples>([\s\S]*?)<\/behavioral_examples>/
    );
    expect(block).not.toBeNull();
    const quoted = block![1].match(/[“"][^”"]+[”"]/g) ?? [];
    expect(quoted.length).toBeGreaterThan(0);
    for (const q of quoted) {
      const words = wordCount(q.replace(/[“”"]/g, ''));
      expect(words).toBeLessThanOrEqual(10);
    }
  });
});
