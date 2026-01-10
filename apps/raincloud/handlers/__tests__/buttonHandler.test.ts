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
import type { ButtonHandler } from '../../types/buttons';
import { assertEquals, assert } from '@std/assert';

// Mock handler
const mockHandler: ButtonHandler = async (_interaction, _context) => ({
  success: true,
});

// Button Handler System tests
Deno.test('button handler system', async (t) => {
  await t.step('setup', () => {
    clearAllHandlers();
  });

  await t.step('registerButtonHandler - registers a new handler', () => {
    registerButtonHandler('test', mockHandler);
    assertEquals(hasButtonHandler('test'), true);
  });

  await t.step('registerButtonHandler - allows registering multiple handlers', () => {
    const handler1: ButtonHandler = async () => ({ success: true });
    const handler2: ButtonHandler = async () => ({ success: true });

    registerButtonHandler('test1', handler1);
    registerButtonHandler('test2', handler2);

    assertEquals(hasButtonHandler('test1'), true);
    assertEquals(hasButtonHandler('test2'), true);
    assertEquals(getHandlerCount(), 2);
  });

  await t.step('registerButtonHandler - overwrites existing handler', () => {
    const handler1: ButtonHandler = async () => ({ success: true });
    const handler2: ButtonHandler = async () => ({ success: true });

    registerButtonHandler('test', handler1);
    registerButtonHandler('test', handler2);

    const registered = getButtonHandler('test');
    assertEquals(registered, handler2);
  });

  await t.step('unregisterButtonHandler - removes a registered handler', () => {
    registerButtonHandler('test', mockHandler);
    assertEquals(hasButtonHandler('test'), true);

    const removed = unregisterButtonHandler('test');
    assertEquals(removed, true);
    assertEquals(hasButtonHandler('test'), false);
  });

  await t.step('unregisterButtonHandler - returns false when removing non-existent handler', () => {
    const removed = unregisterButtonHandler('nonexistent');
    assertEquals(removed, false);
  });

  await t.step('getButtonHandler - returns registered handler', () => {
    registerButtonHandler('test', mockHandler);
    const handler = getButtonHandler('test');
    assertEquals(handler, mockHandler);
  });

  await t.step('getButtonHandler - returns undefined for non-existent handler', () => {
    const handler = getButtonHandler('nonexistent');
    assertEquals(handler, undefined);
  });

  await t.step('hasButtonHandler - returns true for registered handler', () => {
    registerButtonHandler('test', mockHandler);
    assertEquals(hasButtonHandler('test'), true);
  });

  await t.step('hasButtonHandler - returns false for non-existent handler', () => {
    assertEquals(hasButtonHandler('nonexistent'), false);
  });

  await t.step('clearAllHandlers - removes all handlers', () => {
    registerButtonHandler('test1', mockHandler);
    registerButtonHandler('test2', mockHandler);
    assertEquals(getHandlerCount(), 2);

    clearAllHandlers();
    assertEquals(getHandlerCount(), 0);
  });

  await t.step('getRegisteredPrefixes - returns all registered prefixes', () => {
    registerButtonHandler('prefix1', mockHandler);
    registerButtonHandler('prefix2', mockHandler);
    registerButtonHandler('prefix3', mockHandler);

    const prefixes = getRegisteredPrefixes();
    assertEquals(prefixes.length, 3);
    assert(prefixes.includes('prefix1'));
    assert(prefixes.includes('prefix2'));
    assert(prefixes.includes('prefix3'));
  });

  await t.step('getHandlerCount - returns 0 when no handlers registered', () => {
    clearAllHandlers();
    assertEquals(getHandlerCount(), 0);
  });

  await t.step('getHandlerCount - returns correct count after registrations', () => {
    clearAllHandlers();
    registerButtonHandler('test1', mockHandler);
    assertEquals(getHandlerCount(), 1);

    registerButtonHandler('test2', mockHandler);
    assertEquals(getHandlerCount(), 2);

    registerButtonHandler('test3', mockHandler);
    assertEquals(getHandlerCount(), 3);
  });

  await t.step('getHandlerCount - returns correct count after unregistration', () => {
    clearAllHandlers();
    registerButtonHandler('test1', mockHandler);
    registerButtonHandler('test2', mockHandler);
    assertEquals(getHandlerCount(), 2);

    unregisterButtonHandler('test1');
    assertEquals(getHandlerCount(), 1);
  });
});
