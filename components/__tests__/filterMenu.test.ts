/**
 * Tests for filter menu component
 */

import {
  getFilterOptions,
  createFilterMenu,
  getFilterDescription,
  validateFilterSelection,
} from '../../components/select-menus/string/filterMenu';
import type { AudioFilter } from '../../types/select-menus';

describe('Filter Menu', () => {
  describe('getFilterOptions', () => {
    it('returns all filter options', () => {
      const options = getFilterOptions();

      expect(options).toHaveLength(5);
      expect(options[0].value).toBe('none');
      expect(options[1].value).toBe('bassboost');
      expect(options[2].value).toBe('nightcore');
      expect(options[3].value).toBe('vaporwave');
      expect(options[4].value).toBe('8d');
    });

    it('includes labels and descriptions', () => {
      const options = getFilterOptions();

      options.forEach((option) => {
        expect(option.label).toBeDefined();
        expect(option.description).toBeDefined();
        expect(option.value).toBeDefined();
      });
    });

    it('includes emojis', () => {
      const options = getFilterOptions();

      options.forEach((option) => {
        expect(option.emoji).toBeDefined();
        expect(option.emoji).toMatch(/./); // Has at least one character
      });
    });
  });

  describe('createFilterMenu', () => {
    it('creates menu with correct custom ID', () => {
      const menu = createFilterMenu('123456');
      const component = menu.components[0];

      expect(component?.data?.custom_id).toContain('audio_filter');
      expect(component?.data?.custom_id).toContain('guildId:123456');
    });

    it('sets correct min and max values', () => {
      const menu = createFilterMenu('123456');
      const component = menu.components[0];

      expect(component?.data?.min_values).toBe(0);
      expect(component?.data?.max_values).toBe(3);
    });

    it('marks current filters as default', () => {
      const currentFilters: AudioFilter[] = ['bassboost', 'nightcore'];
      const menu = createFilterMenu('123456', currentFilters);
      const component = menu.components[0];

      const json = component?.toJSON();
      const options = json?.options || [];
      const bassboostOption = options.find((o) => o.value === 'bassboost');
      const nightcoreOption = options.find((o) => o.value === 'nightcore');
      const noneOption = options.find((o) => o.value === 'none');

      expect(bassboostOption?.default).toBe(true);
      expect(nightcoreOption?.default).toBe(true);
      expect(noneOption?.default).toBe(false);
    });
  });

  describe('getFilterDescription', () => {
    it('returns correct descriptions for all filters', () => {
      const filters: AudioFilter[] = ['none', 'bassboost', 'nightcore', 'vaporwave', '8d'];

      filters.forEach((filter) => {
        const description = getFilterDescription(filter);
        expect(description).toBeDefined();
        expect(description.length).toBeGreaterThan(0);
      });
    });

    it('returns default message for unknown filter', () => {
      const description = getFilterDescription('unknown' as AudioFilter);
      expect(description).toBe('Unknown filter');
    });
  });

  describe('validateFilterSelection', () => {
    it('validates valid single filter', () => {
      const result = validateFilterSelection(['bassboost']);

      expect(result.valid).toBe(true);
      expect(result.filters).toEqual(['bassboost']);
      expect(result.error).toBeUndefined();
    });

    it('validates multiple valid filters', () => {
      const result = validateFilterSelection(['bassboost', 'nightcore', '8d']);

      expect(result.valid).toBe(true);
      expect(result.filters).toEqual(['bassboost', 'nightcore', '8d']);
    });

    it('validates none filter alone', () => {
      const result = validateFilterSelection(['none']);

      expect(result.valid).toBe(true);
      expect(result.filters).toEqual(['none']);
    });

    it('rejects invalid filter', () => {
      const result = validateFilterSelection(['invalid_filter']);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid filters');
    });

    it('rejects none with other filters', () => {
      const result = validateFilterSelection(['none', 'bassboost']);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Cannot select "None" with other filters');
    });

    it('rejects mix of valid and invalid filters', () => {
      const result = validateFilterSelection(['bassboost', 'invalid', 'nightcore']);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid filters');
    });

    it('validates empty selection', () => {
      const result = validateFilterSelection([]);

      expect(result.valid).toBe(true);
      expect(result.filters).toEqual([]);
    });
  });
});
