/**
 * Tests for select menu handler system
 */

import {
  registerSelectMenuHandler,
  unregisterSelectMenuHandler,
  getSelectMenuHandler,
  hasSelectMenuHandler,
  clearAllSelectMenuHandlers,
  getRegisteredSelectMenuPrefixes,
  getSelectMenuHandlerCount,
} from '../selectMenuHandler';
import type { SelectMenuHandler } from '../../types/select-menus';

// Mock handler
const mockHandler: SelectMenuHandler = jest.fn(async (_interaction, _context) => ({
  success: true,
}));

describe('Select Menu Handler System', () => {
  beforeEach(() => {
    clearAllSelectMenuHandlers();
  });

  afterEach(() => {
    clearAllSelectMenuHandlers();
  });

  describe('registerSelectMenuHandler', () => {
    it('registers a new handler', () => {
      registerSelectMenuHandler('test', mockHandler);
      expect(hasSelectMenuHandler('test')).toBe(true);
    });

    it('allows registering multiple handlers', () => {
      const handler1: SelectMenuHandler = jest.fn(async () => ({ success: true }));
      const handler2: SelectMenuHandler = jest.fn(async () => ({ success: true }));

      registerSelectMenuHandler('test1', handler1);
      registerSelectMenuHandler('test2', handler2);

      expect(hasSelectMenuHandler('test1')).toBe(true);
      expect(hasSelectMenuHandler('test2')).toBe(true);
      expect(getSelectMenuHandlerCount()).toBe(2);
    });

    it('overwrites existing handler with warning', () => {
      const handler1: SelectMenuHandler = jest.fn(async () => ({ success: true }));
      const handler2: SelectMenuHandler = jest.fn(async () => ({ success: true }));

      registerSelectMenuHandler('test', handler1);
      registerSelectMenuHandler('test', handler2);

      const registered = getSelectMenuHandler('test');
      expect(registered).toBe(handler2);
    });
  });

  describe('unregisterSelectMenuHandler', () => {
    it('removes a registered handler', () => {
      registerSelectMenuHandler('test', mockHandler);
      expect(hasSelectMenuHandler('test')).toBe(true);

      const removed = unregisterSelectMenuHandler('test');
      expect(removed).toBe(true);
      expect(hasSelectMenuHandler('test')).toBe(false);
    });

    it('returns false when removing non-existent handler', () => {
      const removed = unregisterSelectMenuHandler('nonexistent');
      expect(removed).toBe(false);
    });
  });

  describe('getSelectMenuHandler', () => {
    it('retrieves registered handler', () => {
      registerSelectMenuHandler('test', mockHandler);
      const handler = getSelectMenuHandler('test');
      expect(handler).toBe(mockHandler);
    });

    it('returns undefined for non-existent handler', () => {
      const handler = getSelectMenuHandler('nonexistent');
      expect(handler).toBeUndefined();
    });
  });

  describe('hasSelectMenuHandler', () => {
    it('returns true for registered handler', () => {
      registerSelectMenuHandler('test', mockHandler);
      expect(hasSelectMenuHandler('test')).toBe(true);
    });

    it('returns false for non-existent handler', () => {
      expect(hasSelectMenuHandler('nonexistent')).toBe(false);
    });
  });

  describe('clearAllSelectMenuHandlers', () => {
    it('removes all handlers', () => {
      registerSelectMenuHandler('test1', mockHandler);
      registerSelectMenuHandler('test2', mockHandler);
      registerSelectMenuHandler('test3', mockHandler);

      expect(getSelectMenuHandlerCount()).toBe(3);

      clearAllSelectMenuHandlers();

      expect(getSelectMenuHandlerCount()).toBe(0);
      expect(hasSelectMenuHandler('test1')).toBe(false);
      expect(hasSelectMenuHandler('test2')).toBe(false);
      expect(hasSelectMenuHandler('test3')).toBe(false);
    });
  });

  describe('getRegisteredSelectMenuPrefixes', () => {
    it('returns empty array when no handlers registered', () => {
      const prefixes = getRegisteredSelectMenuPrefixes();
      expect(prefixes).toEqual([]);
    });

    it('returns all registered prefixes', () => {
      registerSelectMenuHandler('prefix1', mockHandler);
      registerSelectMenuHandler('prefix2', mockHandler);
      registerSelectMenuHandler('prefix3', mockHandler);

      const prefixes = getRegisteredSelectMenuPrefixes();
      expect(prefixes).toHaveLength(3);
      expect(prefixes).toContain('prefix1');
      expect(prefixes).toContain('prefix2');
      expect(prefixes).toContain('prefix3');
    });
  });

  describe('getSelectMenuHandlerCount', () => {
    it('returns 0 when no handlers registered', () => {
      expect(getSelectMenuHandlerCount()).toBe(0);
    });

    it('returns correct count after registrations', () => {
      registerSelectMenuHandler('test1', mockHandler);
      expect(getSelectMenuHandlerCount()).toBe(1);

      registerSelectMenuHandler('test2', mockHandler);
      expect(getSelectMenuHandlerCount()).toBe(2);

      registerSelectMenuHandler('test3', mockHandler);
      expect(getSelectMenuHandlerCount()).toBe(3);
    });

    it('returns correct count after unregistration', () => {
      registerSelectMenuHandler('test1', mockHandler);
      registerSelectMenuHandler('test2', mockHandler);
      expect(getSelectMenuHandlerCount()).toBe(2);

      unregisterSelectMenuHandler('test1');
      expect(getSelectMenuHandlerCount()).toBe(1);
    });
  });
});
