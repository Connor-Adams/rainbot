/**
 * Tests for button handler system
 */

import {
  registerButtonHandler,
  unregisterButtonHandler,
  getButtonHandler,
  hasButtonHandler,
  clearAllHandlers,
  getRegisteredPrefixes,
  getHandlerCount,
} from '../buttonHandler';
import type { ButtonHandler } from '@rainbot/protocol';

// Mock handler
const mockHandler: ButtonHandler = jest.fn(async (_interaction, _context) => ({
  success: true,
}));

describe('Button Handler System', () => {
  beforeEach(() => {
    clearAllHandlers();
  });

  afterEach(() => {
    clearAllHandlers();
  });

  describe('registerButtonHandler', () => {
    it('registers a new handler', () => {
      registerButtonHandler('test', mockHandler);
      expect(hasButtonHandler('test')).toBe(true);
    });

    it('allows registering multiple handlers', () => {
      const handler1: ButtonHandler = jest.fn(async () => ({ success: true }));
      const handler2: ButtonHandler = jest.fn(async () => ({ success: true }));

      registerButtonHandler('test1', handler1);
      registerButtonHandler('test2', handler2);

      expect(hasButtonHandler('test1')).toBe(true);
      expect(hasButtonHandler('test2')).toBe(true);
      expect(getHandlerCount()).toBe(2);
    });

    it('overwrites existing handler with warning', () => {
      const handler1: ButtonHandler = jest.fn(async () => ({ success: true }));
      const handler2: ButtonHandler = jest.fn(async () => ({ success: true }));

      registerButtonHandler('test', handler1);
      registerButtonHandler('test', handler2);

      const registered = getButtonHandler('test');
      expect(registered).toBe(handler2);
    });
  });

  describe('unregisterButtonHandler', () => {
    it('removes a registered handler', () => {
      registerButtonHandler('test', mockHandler);
      expect(hasButtonHandler('test')).toBe(true);

      const removed = unregisterButtonHandler('test');
      expect(removed).toBe(true);
      expect(hasButtonHandler('test')).toBe(false);
    });

    it('returns false when removing non-existent handler', () => {
      const removed = unregisterButtonHandler('nonexistent');
      expect(removed).toBe(false);
    });
  });

  describe('getButtonHandler', () => {
    it('retrieves registered handler', () => {
      registerButtonHandler('test', mockHandler);
      const handler = getButtonHandler('test');
      expect(handler).toBe(mockHandler);
    });

    it('returns undefined for non-existent handler', () => {
      const handler = getButtonHandler('nonexistent');
      expect(handler).toBeUndefined();
    });
  });

  describe('hasButtonHandler', () => {
    it('returns true for registered handler', () => {
      registerButtonHandler('test', mockHandler);
      expect(hasButtonHandler('test')).toBe(true);
    });

    it('returns false for non-existent handler', () => {
      expect(hasButtonHandler('nonexistent')).toBe(false);
    });
  });

  describe('clearAllHandlers', () => {
    it('removes all handlers', () => {
      registerButtonHandler('test1', mockHandler);
      registerButtonHandler('test2', mockHandler);
      registerButtonHandler('test3', mockHandler);

      expect(getHandlerCount()).toBe(3);

      clearAllHandlers();

      expect(getHandlerCount()).toBe(0);
      expect(hasButtonHandler('test1')).toBe(false);
      expect(hasButtonHandler('test2')).toBe(false);
      expect(hasButtonHandler('test3')).toBe(false);
    });
  });

  describe('getRegisteredPrefixes', () => {
    it('returns empty array when no handlers registered', () => {
      const prefixes = getRegisteredPrefixes();
      expect(prefixes).toEqual([]);
    });

    it('returns all registered prefixes', () => {
      registerButtonHandler('prefix1', mockHandler);
      registerButtonHandler('prefix2', mockHandler);
      registerButtonHandler('prefix3', mockHandler);

      const prefixes = getRegisteredPrefixes();
      expect(prefixes).toHaveLength(3);
      expect(prefixes).toContain('prefix1');
      expect(prefixes).toContain('prefix2');
      expect(prefixes).toContain('prefix3');
    });
  });

  describe('getHandlerCount', () => {
    it('returns 0 when no handlers registered', () => {
      expect(getHandlerCount()).toBe(0);
    });

    it('returns correct count after registrations', () => {
      registerButtonHandler('test1', mockHandler);
      expect(getHandlerCount()).toBe(1);

      registerButtonHandler('test2', mockHandler);
      expect(getHandlerCount()).toBe(2);

      registerButtonHandler('test3', mockHandler);
      expect(getHandlerCount()).toBe(3);
    });

    it('returns correct count after unregistration', () => {
      registerButtonHandler('test1', mockHandler);
      registerButtonHandler('test2', mockHandler);
      expect(getHandlerCount()).toBe(2);

      unregisterButtonHandler('test1');
      expect(getHandlerCount()).toBe(1);
    });
  });
});
