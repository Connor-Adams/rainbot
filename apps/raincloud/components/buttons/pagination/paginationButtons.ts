/**
 * Pagination control buttons
 */

import { ActionRowBuilder, ButtonBuilder } from 'discord.js';
import { createSecondaryButton, createButtonId } from '../../builders/buttonBuilder';
import type { PaginationState } from '@rainbot/protocol';

/**
 * Create previous page button
 */
export function createPrevPageButton(
  page: number,
  disabled: boolean = false,
  guildId?: string
): ButtonBuilder {
  const metadata = guildId ? { page: page - 1, guildId } : { page: page - 1 };
  const customId = createButtonId('queue_prev', { action: 'prev', ...metadata });
  return createSecondaryButton(customId, 'Previous', '◀️', disabled);
}

/**
 * Create next page button
 */
export function createNextPageButton(
  page: number,
  disabled: boolean = false,
  guildId?: string
): ButtonBuilder {
  const metadata = guildId ? { page: page + 1, guildId } : { page: page + 1 };
  const customId = createButtonId('queue_next', { action: 'next', ...metadata });
  return createSecondaryButton(customId, 'Next', '▶️', disabled);
}

/**
 * Create first page button
 */
export function createFirstPageButton(disabled: boolean = false, guildId?: string): ButtonBuilder {
  const metadata = guildId ? { page: 0, guildId } : { page: 0 };
  const customId = createButtonId('queue_first', { action: 'first', ...metadata });
  return createSecondaryButton(customId, 'First', '⏮️', disabled);
}

/**
 * Create last page button
 */
export function createLastPageButton(
  lastPage: number,
  disabled: boolean = false,
  guildId?: string
): ButtonBuilder {
  const metadata = guildId ? { page: lastPage, guildId } : { page: lastPage };
  const customId = createButtonId('queue_last', { action: 'last', ...metadata });
  return createSecondaryButton(customId, 'Last', '⏭️', disabled);
}

/**
 * Create page indicator button (disabled, shows current page)
 */
export function createPageIndicatorButton(state: PaginationState): ButtonBuilder {
  const { currentPage, totalPages } = state;
  return createSecondaryButton(
    'page_indicator',
    `Page ${currentPage + 1}/${totalPages}`,
    '📄',
    true // Always disabled
  );
}

/**
 * Create a complete pagination row
 */
export function createPaginationRow(
  state: PaginationState,
  guildId?: string
): ActionRowBuilder<ButtonBuilder> {
  const { currentPage, totalPages } = state;
  const isFirstPage = currentPage === 0;
  const isLastPage = currentPage === totalPages - 1;

  const buttons: ButtonBuilder[] = [];

  // Only show first/last buttons if there are more than 2 pages
  if (totalPages > 2) {
    buttons.push(createFirstPageButton(isFirstPage, guildId));
  }

  buttons.push(createPrevPageButton(currentPage, isFirstPage, guildId));
  buttons.push(createPageIndicatorButton(state));
  buttons.push(createNextPageButton(currentPage, isLastPage, guildId));

  if (totalPages > 2) {
    buttons.push(createLastPageButton(totalPages - 1, isLastPage, guildId));
  }

  return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
}

/**
 * Create simple pagination row (just prev/next)
 */
export function createSimplePaginationRow(
  currentPage: number,
  totalPages: number,
  guildId?: string
): ActionRowBuilder<ButtonBuilder> {
  const isFirstPage = currentPage === 0;
  const isLastPage = currentPage === totalPages - 1;

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    createPrevPageButton(currentPage, isFirstPage, guildId),
    createPageIndicatorButton({
      currentPage,
      totalPages,
      itemsPerPage: 0,
      totalItems: 0,
    }),
    createNextPageButton(currentPage, isLastPage, guildId)
  );
}

/**
 * Calculate pagination state from total items
 */
export function calculatePaginationState(
  totalItems: number,
  itemsPerPage: number,
  currentPage: number = 0
): PaginationState {
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const safePage = Math.max(0, Math.min(currentPage, totalPages - 1));

  return {
    currentPage: safePage,
    totalPages,
    itemsPerPage,
    totalItems,
  };
}
