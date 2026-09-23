import { RainbotAttr } from '../semconv';

describe('RainbotAttr', () => {
  it('namespaces every attribute under rainbot.', () => {
    for (const value of Object.values(RainbotAttr)) {
      expect(value).toMatch(/^rainbot\./);
    }
  });

  it('has no duplicate attribute names', () => {
    const values = Object.values(RainbotAttr);
    expect(new Set(values).size).toBe(values.length);
  });

  it('exposes the attributes the spec names', () => {
    expect(RainbotAttr.guildId).toBe('rainbot.guild_id');
    expect(RainbotAttr.worker).toBe('rainbot.worker');
    expect(RainbotAttr.extractionPath).toBe('rainbot.extraction_path');
  });
});
