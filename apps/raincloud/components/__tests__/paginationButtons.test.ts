/**
 * Tests for pagination buttons
 */

import {
  createPrevPageButton,
  createNextPageButton,
  createPageIndicatorButton,
  createPaginationRow,
  createSimplePaginationRow,
  calculatePaginationState,
} from '../buttons/pagination/paginationButtons';
import type { PaginationState } from '../../types/buttons';

describe('Pagination Buttons', () => {
  describe('createPrevPageButton', () => {
    it('creates previous page button', () => {
      const button = createPrevPageButton(2);
      expect(button.data.label).toBe('Previous');
      expect(button.data.custom_id).toContain('queue_prev');
      expect(button.data.custom_id).toContain('page:1');
    });

    it('creates disabled button on first page', () => {
      const button = createPrevPageButton(0, true);
      expect(button.data.disabled).toBe(true);
    });

    it('includes guild ID when provided', () => {
      const button = createPrevPageButton(2, false, '12345');
      expect(button.data.custom_id).toContain('guildId:12345');
    });
  });

  describe('createNextPageButton', () => {
    it('creates next page button', () => {
      const button = createNextPageButton(0);
      expect(button.data.label).toBe('Next');
      expect(button.data.custom_id).toContain('queue_next');
      expect(button.data.custom_id).toContain('page:1');
    });

    it('creates disabled button on last page', () => {
      const button = createNextPageButton(5, true);
      expect(button.data.disabled).toBe(true);
    });
  });

  describe('createPageIndicatorButton', () => {
    it('creates page indicator button', () => {
      const state: PaginationState = {
        currentPage: 2,
        totalPages: 10,
        itemsPerPage: 20,
        totalItems: 200,
      };

      const button = createPageIndicatorButton(state);
      expect(button.data.label).toBe('Page 3/10'); // currentPage is 0-indexed
      expect(button.data.disabled).toBe(true);
    });

    it('shows page 1/1 for single page', () => {
      const state: PaginationState = {
        currentPage: 0,
        totalPages: 1,
        itemsPerPage: 20,
        totalItems: 5,
      };

      const button = createPageIndicatorButton(state);
      expect(button.data.label).toBe('Page 1/1');
    });
  });

  describe('createPaginationRow', () => {
    it('creates full pagination row with all buttons', () => {
      const state: PaginationState = {
        currentPage: 5,
        totalPages: 10,
        itemsPerPage: 20,
        totalItems: 200,
      };

      const row = createPaginationRow(state);
      expect(row.components.length).toBeGreaterThanOrEqual(3); // At minimum: prev, indicator, next
    });

    it('includes first/last buttons when more than 2 pages', () => {
      const state: PaginationState = {
        currentPage: 1,
        totalPages: 5,
        itemsPerPage: 20,
        totalItems: 100,
      };

      const row = createPaginationRow(state);
      expect(row.components).toHaveLength(5); // first, prev, indicator, next, last
    });

    it('omits first/last buttons when 2 or fewer pages', () => {
      const state: PaginationState = {
        currentPage: 0,
        totalPages: 2,
        itemsPerPage: 20,
        totalItems: 40,
      };

      const row = createPaginationRow(state);
      expect(row.components).toHaveLength(3); // prev, indicator, next
    });

    it('disables prev button on first page', () => {
      const state: PaginationState = {
        currentPage: 0,
        totalPages: 5,
        itemsPerPage: 20,
        totalItems: 100,
      };

      const row = createPaginationRow(state);
      const prevButton = row.components[1]; // Second button (after first button)
      expect(prevButton.data.disabled).toBe(true);
    });

    it('disables next button on last page', () => {
      const state: PaginationState = {
        currentPage: 4,
        totalPages: 5,
        itemsPerPage: 20,
        totalItems: 100,
      };

      const row = createPaginationRow(state);
      const nextButton = row.components[3]; // Fourth button (before last button)
      expect(nextButton.data.disabled).toBe(true);
    });
  });

  describe('createSimplePaginationRow', () => {
    it('creates simple pagination row', () => {
      const row = createSimplePaginationRow(1, 5);
      expect(row.components).toHaveLength(3); // prev, indicator, next
    });

    it('includes guild ID in buttons when provided', () => {
      const row = createSimplePaginationRow(1, 5, '12345');
      const prevButton = row.components[0];
      expect(prevButton.data.custom_id).toContain('guildId:12345');
    });
  });

  describe('calculatePaginationState', () => {
    it('calculates state for full pages', () => {
      const state = calculatePaginationState(100, 20, 2);
      expect(state.totalPages).toBe(5);
      expect(state.currentPage).toBe(2);
      expect(state.totalItems).toBe(100);
      expect(state.itemsPerPage).toBe(20);
    });

    it('calculates state with partial last page', () => {
      const state = calculatePaginationState(95, 20, 0);
      expect(state.totalPages).toBe(5); // 20, 20, 20, 20, 15
    });

    it('handles single page', () => {
      const state = calculatePaginationState(10, 20, 0);
      expect(state.totalPages).toBe(1);
      expect(state.currentPage).toBe(0);
    });

    it('handles zero items', () => {
      const state = calculatePaginationState(0, 20, 0);
      expect(state.totalPages).toBe(1); // At least 1 page
      expect(state.currentPage).toBe(0);
    });

    it('clamps current page to valid range', () => {
      const state = calculatePaginationState(100, 20, 10); // Request page 10, but only 5 pages exist
      expect(state.currentPage).toBe(4); // Should be clamped to last page (0-indexed)
    });

    it('handles negative page numbers', () => {
      const state = calculatePaginationState(100, 20, -5);
      expect(state.currentPage).toBe(0); // Should be clamped to 0
    });
  });
});
