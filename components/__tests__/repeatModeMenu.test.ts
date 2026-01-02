/**
 * Tests for repeat mode menu component
 */

import {
  getRepeatModeOptions,
  createRepeatModeMenu,
  getRepeatModeDescription,
  getRepeatModeEmoji,
  validateRepeatMode,
} from '../../components/select-menus/string/repeatModeMenu';
import type { RepeatMode } from '../../types/select-menus';

describe('Repeat Mode Menu', () => {
  describe('getRepeatModeOptions', () => {
    it('returns all repeat mode options', () => {
      const options = getRepeatModeOptions();

      expect(options).toHaveLength(3);
      expect(options[0].value).toBe('off');
      expect(options[1].value).toBe('track');
      expect(options[2].value).toBe('queue');
    });

    it('includes labels and descriptions', () => {
      const options = getRepeatModeOptions();

      options.forEach((option) => {
        expect(option.label).toBeDefined();
        expect(option.description).toBeDefined();
        expect(option.value).toBeDefined();
      });
    });

    it('includes emojis', () => {
      const options = getRepeatModeOptions();

      options.forEach((option) => {
        expect(option.emoji).toBeDefined();
        expect(option.emoji).toMatch(/./);
      });
    });
  });

  describe('createRepeatModeMenu', () => {
    it('creates menu with correct custom ID', () => {
      const menu = createRepeatModeMenu('123456');
      const component = menu.components[0];

      expect(component?.data?.custom_id).toContain('repeat_mode');
      expect(component?.data?.custom_id).toContain('guildId:123456');
    });

    it('sets correct min and max values', () => {
      const menu = createRepeatModeMenu('123456');
      const component = menu.components[0];

      expect(component?.data?.min_values).toBe(1);
      expect(component?.data?.max_values).toBe(1);
    });

    it('marks current mode as default', () => {
      const currentMode: RepeatMode = 'track';
      const menu = createRepeatModeMenu('123456', currentMode);
      const component = menu.components[0];

      const json = component?.toJSON();
      const options = json?.options || [];
      const trackOption = options.find((o: any) => o.value === 'track');
      const offOption = options.find((o: any) => o.value === 'off');

      expect(trackOption?.default).toBe(true);
      expect(offOption?.default).toBe(false);
    });

    it('creates menu without default selection', () => {
      const menu = createRepeatModeMenu('123456');
      const component = menu.components[0];

      const json = component?.toJSON();
      const options = json?.options || [];
      const defaultOptions = options.filter((o: any) => o.default);

      expect(defaultOptions).toHaveLength(0);
    });
  });

  describe('getRepeatModeDescription', () => {
    it('returns correct descriptions for all modes', () => {
      const modes: RepeatMode[] = ['off', 'track', 'queue'];

      modes.forEach((mode) => {
        const description = getRepeatModeDescription(mode);
        expect(description).toBeDefined();
        expect(description.length).toBeGreaterThan(0);
      });
    });

    it('returns default message for unknown mode', () => {
      const description = getRepeatModeDescription('unknown' as RepeatMode);
      expect(description).toBe('Unknown repeat mode');
    });
  });

  describe('getRepeatModeEmoji', () => {
    it('returns correct emojis for all modes', () => {
      expect(getRepeatModeEmoji('off')).toBe('➡️');
      expect(getRepeatModeEmoji('track')).toBe('🔂');
      expect(getRepeatModeEmoji('queue')).toBe('🔁');
    });

    it('returns question mark for unknown mode', () => {
      const emoji = getRepeatModeEmoji('unknown' as RepeatMode);
      expect(emoji).toBe('❓');
    });
  });

  describe('validateRepeatMode', () => {
    it('validates valid modes', () => {
      const modes: RepeatMode[] = ['off', 'track', 'queue'];

      modes.forEach((mode) => {
        const result = validateRepeatMode(mode);
        expect(result.valid).toBe(true);
        expect(result.mode).toBe(mode);
        expect(result.error).toBeUndefined();
      });
    });

    it('rejects invalid mode', () => {
      const result = validateRepeatMode('invalid');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid repeat mode');
      expect(result.mode).toBeUndefined();
    });

    it('rejects empty string', () => {
      const result = validateRepeatMode('');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
