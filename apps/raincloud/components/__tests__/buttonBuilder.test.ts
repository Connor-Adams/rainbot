/**
 * Tests for button builder utilities
 */

import { assertEquals, assert, assertThrows, assertRejects } from '@std/assert';
import { ButtonStyle } from 'npm:discord.js@14.15.3';
import {
  createButtonId,
  parseButtonId,
  createButton,
  createPrimaryButton,
  createSecondaryButton,
  createSuccessButton,
  createDangerButton,
} from '../builders/buttonBuilder.ts';

// buttonBuilder tests
// createButtonId tests
Deno.test('buttonBuilder - createButtonId - creates basic button ID with prefix only', () => {
  const id = createButtonId('test', { action: 'test' });
  assertEquals(id, 'test_action:test');
});

Deno.test('buttonBuilder - createButtonId - creates button ID with metadata', () => {
  const id = createButtonId('music', { action: 'pause', guildId: '12345' });
  assertEquals(id, 'music_action:pause_guildId:12345');
});

Deno.test(
  'buttonBuilder - createButtonId - creates button ID with multiple metadata fields',
  () => {
    const id = createButtonId('queue', { action: 'next', page: 2, guildId: '12345' });
    assert(id.includes('queue_'));
    assert(id.includes('page:2'));
    assert(id.includes('guildId:12345'));
  }
);

Deno.test('buttonBuilder - createButtonId - skips undefined values', () => {
  const id = createButtonId('test', { action: 'test', guildId: undefined });
  assertEquals(id, 'test_action:test');
});

Deno.test('buttonBuilder - createButtonId - skips null values', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const id = createButtonId('test', { action: 'test', userId: null as any });
  assertEquals(id, 'test_action:test');
});

// parseButtonId tests
Deno.test('buttonBuilder - parseButtonId - parses basic button ID', () => {
  const { prefix, metadata } = parseButtonId('test');
  assertEquals(prefix, 'test');
  assertEquals(metadata.action, 'test');
});

Deno.test('buttonBuilder - parseButtonId - parses button ID with metadata', () => {
  const { prefix, metadata } = parseButtonId('music_guildId:12345');
  assertEquals(prefix, 'music');
  assertEquals(metadata.guildId, '12345');
});

Deno.test('buttonBuilder - parseButtonId - parses button ID with numeric metadata', () => {
  const { prefix, metadata } = parseButtonId('queue_page:2_guildId:12345');
  assertEquals(prefix, 'queue');
  assertEquals(metadata.page, 2);
  assertEquals(metadata.guildId, '12345');
});

Deno.test('buttonBuilder - parseButtonId - handles malformed metadata gracefully', () => {
  const { prefix, metadata } = parseButtonId('test_invalid');
  assertEquals(prefix, 'test');
  assertEquals(metadata.action, 'test');
});

// createButton tests
Deno.test('buttonBuilder - createButton - creates button with basic properties', () => {
  const button = createButton('test_id', 'Test Button');
  const data = button.toJSON() as any;
  assertEquals(data.custom_id, 'test_id');
  assertEquals(data.label, 'Test Button');
  assertEquals(data.style, ButtonStyle.Secondary);
});

Deno.test('buttonBuilder - createButton - creates button with emoji', () => {
  const button = createButton('test_id', 'Test', ButtonStyle.Primary, '🎵');
  const data = button.toJSON() as any;
  assert(data.emoji);
});

Deno.test('buttonBuilder - createButton - creates disabled button', () => {
  const button = createButton('test_id', 'Test', ButtonStyle.Secondary, undefined, true);
  const data = button.toJSON() as any;
  assertEquals(data.disabled, true);
});

Deno.test('buttonBuilder - createButton - creates enabled button by default', () => {
  const button = createButton('test_id', 'Test');
  const data = button.toJSON() as any;
  assertEquals(data.disabled, false);
});

// createPrimaryButton tests
Deno.test('buttonBuilder - createPrimaryButton - creates primary style button', () => {
  const button = createPrimaryButton('test_id', 'Primary');
  const data = button.toJSON() as any;
  assertEquals(data.style, ButtonStyle.Primary);
});

// createSecondaryButton tests
Deno.test('buttonBuilder - createSecondaryButton - creates secondary style button', () => {
  const button = createSecondaryButton('test_id', 'Secondary');
  const data = button.toJSON() as any;
  assertEquals(data.style, ButtonStyle.Secondary);
});

// createSuccessButton tests
Deno.test('buttonBuilder - createSuccessButton - creates success style button', () => {
  const button = createSuccessButton('test_id', 'Success');
  const data = button.toJSON() as any;
  assertEquals(data.style, ButtonStyle.Success);
});

// createDangerButton tests
Deno.test('buttonBuilder - createDangerButton - creates danger style button', () => {
  const button = createDangerButton('test_id', 'Danger');
  const data = button.toJSON() as any;
  assertEquals(data.style, ButtonStyle.Danger);
});
