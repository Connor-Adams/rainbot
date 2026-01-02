/**
 * Tests for select menu builder utilities
 */

import {
  createSelectMenuId,
  parseSelectMenuId,
  createStringSelectMenu,
  validateSelectMenuConfig,
} from '../../components/builders/selectMenuBuilder';
import type { SelectMenuOption } from '../../types/select-menus';

describe('Select Menu Builder', () => {
  describe('createSelectMenuId', () => {
    it('creates ID with prefix only', () => {
      const id = createSelectMenuId('audio_filter');
      expect(id).toBe('audio_filter');
    });

    it('creates ID with metadata', () => {
      const id = createSelectMenuId('audio_filter', { guildId: '123', page: 1 });
      expect(id).toBe('audio_filter_guildId:123_page:1');
    });

    it('ignores undefined and null values', () => {
      const id = createSelectMenuId('test', { guildId: '123', userId: undefined, page: null });
      expect(id).toBe('test_guildId:123');
    });

    it('handles empty metadata', () => {
      const id = createSelectMenuId('test', {});
      expect(id).toBe('test');
    });
  });

  describe('parseSelectMenuId', () => {
    it('parses ID with prefix only', () => {
      const result = parseSelectMenuId('audiofilter');
      expect(result.prefix).toBe('audiofilter');
      expect(result.metadata.action).toBe('audiofilter');
    });

    it('parses ID with metadata', () => {
      const result = parseSelectMenuId('audiofilter_guildId:123_page:2');
      expect(result.prefix).toBe('audiofilter');
      expect(result.metadata.guildId).toBe(123); // Numeric strings are parsed as numbers
      expect(result.metadata.page).toBe(2);
    });

    it('converts numeric strings to numbers', () => {
      const result = parseSelectMenuId('test_page:5_count:10');
      expect(result.metadata.page).toBe(5);
      expect(result.metadata.count).toBe(10);
      expect(typeof result.metadata.page).toBe('number');
    });

    it('keeps non-numeric strings as strings', () => {
      const result = parseSelectMenuId('test_guildId:abc123_userId:xyz789');
      expect(result.metadata.guildId).toBe('abc123');
      expect(result.metadata.userId).toBe('xyz789');
      expect(typeof result.metadata.guildId).toBe('string');
    });

    it('handles empty parts gracefully', () => {
      const result = parseSelectMenuId('test__extra');
      expect(result.prefix).toBe('test');
      expect(result.metadata.action).toBe('test');
    });
  });

  describe('createStringSelectMenu', () => {
    const options: SelectMenuOption[] = [
      { label: 'Option 1', value: 'opt1', description: 'First option' },
      { label: 'Option 2', value: 'opt2', description: 'Second option', emoji: '🎵' },
    ];

    it('creates select menu with basic options', () => {
      const menu = createStringSelectMenu('test_menu', 'Choose an option', options);

      expect(menu.data.custom_id).toBe('test_menu');
      expect(menu.data.placeholder).toBe('Choose an option');
      // Discord.js uses toJSON() to serialize, options exist in data but may not be directly visible
      expect(menu.toJSON().options).toHaveLength(2);
    });

    it('sets min and max values', () => {
      const menu = createStringSelectMenu('test_menu', 'Choose options', options, {
        minValues: 0,
        maxValues: 2,
      });

      expect(menu.data.min_values).toBe(0);
      expect(menu.data.max_values).toBe(2);
    });

    it('sets disabled state', () => {
      const menu = createStringSelectMenu('test_menu', 'Choose an option', options, {
        disabled: true,
      });

      expect(menu.data.disabled).toBe(true);
    });

    it('includes emoji and descriptions in options', () => {
      const menu = createStringSelectMenu('test_menu', 'Choose an option', options);
      const json = menu.toJSON();

      expect(json.options[1]?.emoji).toBeDefined();
      expect(json.options[0]?.description).toBe('First option');
    });
  });

  describe('validateSelectMenuConfig', () => {
    it('validates correct configuration', () => {
      const result = validateSelectMenuConfig({
        minValues: 1,
        maxValues: 3,
        optionsCount: 5,
      });

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('rejects minValues out of range', () => {
      const result = validateSelectMenuConfig({ minValues: -1 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('minValues');

      const result2 = validateSelectMenuConfig({ minValues: 26 });
      expect(result2.valid).toBe(false);
      expect(result2.error).toContain('minValues');
    });

    it('rejects maxValues out of range', () => {
      const result = validateSelectMenuConfig({ maxValues: 0 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('maxValues');

      const result2 = validateSelectMenuConfig({ maxValues: 26 });
      expect(result2.valid).toBe(false);
      expect(result2.error).toContain('maxValues');
    });

    it('rejects minValues greater than maxValues', () => {
      const result = validateSelectMenuConfig({
        minValues: 5,
        maxValues: 3,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('minValues cannot be greater than maxValues');
    });

    it('rejects too many options', () => {
      const result = validateSelectMenuConfig({
        optionsCount: 26,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Cannot have more than 25 options');
    });

    it('rejects maxValues exceeding options count', () => {
      const result = validateSelectMenuConfig({
        maxValues: 5,
        optionsCount: 3,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('maxValues cannot exceed number of available options');
    });
  });
});
