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
} from '../buttons/pagination/paginationButtons.ts';
import type { PaginationState } from '../../types/buttons.ts';
import { assertEquals, assert, assertThrows, assertRejects } from '@std/assert';

// Pagination Buttons tests
// createPrevPageButton tests
Deno.test('paginationButtons - createPrevPageButton - creates previous page button', () => {
  const button = createPrevPageButton(2);
  const data = button.toJSON() as any;
  assertEquals(data.label, 'Previous');
  assert(data.custom_id.includes('queue_prev'));
  assert(data.custom_id.includes('page:1'));
});

Deno.test(
  'paginationButtons - createPrevPageButton - creates disabled button on first page',
  () => {
    const button = createPrevPageButton(0, true);
    const data = button.toJSON() as any;
    assertEquals(data.disabled, true);
  }
);

Deno.test('paginationButtons - createPrevPageButton - includes guild ID when provided', () => {
  const button = createPrevPageButton(2, false, '12345');
  const data = button.toJSON() as any;
  assert(data.custom_id.includes('guildId:12345'));
});

// createNextPageButton tests
Deno.test('paginationButtons - createNextPageButton - creates next page button', () => {
  const button = createNextPageButton(0);
  const data = button.toJSON() as any;
  assertEquals(data.label, 'Next');
  assert(data.custom_id.includes('queue_next'));
  assert(data.custom_id.includes('page:1'));
});

Deno.test('paginationButtons - createNextPageButton - creates disabled button on last page', () => {
  const button = createNextPageButton(5, true);
  const data = button.toJSON() as any;
  assertEquals(data.disabled, true);
});

// createPageIndicatorButton tests
Deno.test('paginationButtons - createPageIndicatorButton - creates page indicator button', () => {
  const state: PaginationState = {
    currentPage: 2,
    totalPages: 10,
    itemsPerPage: 20,
    totalItems: 200,
  };

  const button = createPageIndicatorButton(state);
  const data = button.toJSON() as any;
  assertEquals(data.label, 'Page 3/10'); // currentPage is 0-indexed
  assertEquals(data.disabled, true);
});

Deno.test('paginationButtons - createPageIndicatorButton - shows page 1/1 for single page', () => {
  const state: PaginationState = {
    currentPage: 0,
    totalPages: 1,
    itemsPerPage: 20,
    totalItems: 5,
  };

  const button = createPageIndicatorButton(state);
  const data = button.toJSON() as any;
  assertEquals(data.label, 'Page 1/1');
});

// createPaginationRow tests
Deno.test(
  'paginationButtons - createPaginationRow - creates full pagination row with all buttons',
  () => {
    const state: PaginationState = {
      currentPage: 5,
      totalPages: 10,
      itemsPerPage: 20,
      totalItems: 200,
    };

    const row = createPaginationRow(state);
    assert(row.components.length >= 3); // At minimum: prev, indicator, next
  }
);

Deno.test(
  'paginationButtons - createPaginationRow - includes first/last buttons when more than 2 pages',
  () => {
    const state: PaginationState = {
      currentPage: 1,
      totalPages: 5,
      itemsPerPage: 20,
      totalItems: 100,
    };

    const row = createPaginationRow(state);
    assertEquals(row.components.length, 5); // first, prev, indicator, next, last
  }
);

Deno.test(
  'paginationButtons - createPaginationRow - omits first/last buttons when 2 or fewer pages',
  () => {
    const state: PaginationState = {
      currentPage: 0,
      totalPages: 2,
      itemsPerPage: 20,
      totalItems: 40,
    };

    const row = createPaginationRow(state);
    assertEquals(row.components.length, 3); // prev, indicator, next
  }
);

Deno.test('paginationButtons - createPaginationRow - disables prev button on first page', () => {
  const state: PaginationState = {
    currentPage: 0,
    totalPages: 5,
    itemsPerPage: 20,
    totalItems: 100,
  };

  const row = createPaginationRow(state);
  const prevButton = row.components[1] as any; // Second button (after first button)
  assertEquals(prevButton.data.disabled, true);
});

Deno.test('paginationButtons - createPaginationRow - disables next button on last page', () => {
  const state: PaginationState = {
    currentPage: 4,
    totalPages: 5,
    itemsPerPage: 20,
    totalItems: 100,
  };

  const row = createPaginationRow(state);
  const nextButton = row.components[3] as any; // Fourth button (before last button)
  assertEquals(nextButton.data.disabled, true);
});

// createSimplePaginationRow tests
Deno.test('paginationButtons - createSimplePaginationRow - creates simple pagination row', () => {
  const row = createSimplePaginationRow(1, 5);
  assertEquals(row.components.length, 3); // prev, indicator, next
});

Deno.test(
  'paginationButtons - createSimplePaginationRow - includes guild ID in buttons when provided',
  () => {
    const row = createSimplePaginationRow(1, 5, '12345');
    const prevButton = row.components[0] as any;
    assert(prevButton.data.custom_id.includes('guildId:12345'));
  }
);

// calculatePaginationState tests
Deno.test('paginationButtons - calculatePaginationState - calculates state for full pages', () => {
  const state = calculatePaginationState(100, 20, 2);
  assertEquals(state.totalPages, 5);
  assertEquals(state.currentPage, 2);
  assertEquals(state.totalItems, 100);
  assertEquals(state.itemsPerPage, 20);
});

Deno.test(
  'paginationButtons - calculatePaginationState - calculates state with partial last page',
  () => {
    const state = calculatePaginationState(95, 20, 0);
    assertEquals(state.totalPages, 5); // 20, 20, 20, 20, 15
  }
);

Deno.test('paginationButtons - calculatePaginationState - handles single page', () => {
  const state = calculatePaginationState(10, 20, 0);
  assertEquals(state.totalPages, 1);
  assertEquals(state.currentPage, 0);
});

Deno.test('paginationButtons - calculatePaginationState - handles zero items', () => {
  const state = calculatePaginationState(0, 20, 0);
  assertEquals(state.totalPages, 1); // At least 1 page
  assertEquals(state.currentPage, 0);
});

Deno.test(
  'paginationButtons - calculatePaginationState - clamps current page to valid range',
  () => {
    const state = calculatePaginationState(100, 20, 10); // Request page 10, but only 5 pages exist
    assertEquals(state.currentPage, 4); // Should be clamped to last page (0-indexed)
  }
);

Deno.test('paginationButtons - calculatePaginationState - handles negative page numbers', () => {
  const state = calculatePaginationState(100, 20, -5);
  assertEquals(state.currentPage, 0); // Should be clamped to 0
});
