/**
 * Tests for button builder utilities
 */

import { ButtonStyle } from 'discord.js';
import {
  createButtonId,
  parseButtonId,
  createButton,
  createPrimaryButton,
  createSecondaryButton,
  createSuccessButton,
  createDangerButton,
} from '../builders/buttonBuilder';

describe('buttonBuilder', () => {
  describe('createButtonId', () => {
    it('creates basic button ID with prefix only', () => {
      const id = createButtonId('test', { action: 'test' });
      expect(id).toBe('test_action:test');
    });

    it('creates button ID with metadata', () => {
      const id = createButtonId('music', { action: 'pause', guildId: '12345' });
      expect(id).toBe('music_action:pause_guildId:12345');
    });

    it('creates button ID with multiple metadata fields', () => {
      const id = createButtonId('queue', { action: 'next', page: 2, guildId: '12345' });
      expect(id).toContain('queue_');
      expect(id).toContain('page:2');
      expect(id).toContain('guildId:12345');
    });

    it('skips undefined values', () => {
      const id = createButtonId('test', { action: 'test', guildId: undefined });
      expect(id).toBe('test_action:test');
    });

    it('skips null values', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const id = createButtonId('test', { action: 'test', userId: null as any });
      expect(id).toBe('test_action:test');
    });
  });

  describe('parseButtonId', () => {
    it('parses basic button ID', () => {
      const { prefix, metadata } = parseButtonId('test');
      expect(prefix).toBe('test');
      expect(metadata.action).toBe('test');
    });

    it('parses button ID with metadata', () => {
      const { prefix, metadata } = parseButtonId('music_guildId:12345');
      expect(prefix).toBe('music');
      expect(metadata.guildId).toBe(12345);
    });

    it('parses button ID with numeric metadata', () => {
      const { prefix, metadata } = parseButtonId('queue_page:2_guildId:12345');
      expect(prefix).toBe('queue');
      expect(metadata.page).toBe(2);
      expect(metadata.guildId).toBe(12345);
    });

    it('handles malformed metadata gracefully', () => {
      const { prefix, metadata } = parseButtonId('test_invalid');
      expect(prefix).toBe('test');
      expect(metadata.action).toBe('test');
    });
  });

  describe('createButton', () => {
    it('creates button with basic properties', () => {
      const button = createButton('test_id', 'Test Button');
      expect(button.data.custom_id).toBe('test_id');
      expect(button.data.label).toBe('Test Button');
      expect(button.data.style).toBe(ButtonStyle.Secondary);
    });

    it('creates button with emoji', () => {
      const button = createButton('test_id', 'Test', ButtonStyle.Primary, '🎵');
      expect(button.data.emoji).toBeDefined();
    });

    it('creates disabled button', () => {
      const button = createButton('test_id', 'Test', ButtonStyle.Secondary, undefined, true);
      expect(button.data.disabled).toBe(true);
    });

    it('creates enabled button by default', () => {
      const button = createButton('test_id', 'Test');
      expect(button.data.disabled).toBe(false);
    });
  });

  describe('createPrimaryButton', () => {
    it('creates primary style button', () => {
      const button = createPrimaryButton('test_id', 'Primary');
      expect(button.data.style).toBe(ButtonStyle.Primary);
    });
  });

  describe('createSecondaryButton', () => {
    it('creates secondary style button', () => {
      const button = createSecondaryButton('test_id', 'Secondary');
      expect(button.data.style).toBe(ButtonStyle.Secondary);
    });
  });

  describe('createSuccessButton', () => {
    it('creates success style button', () => {
      const button = createSuccessButton('test_id', 'Success');
      expect(button.data.style).toBe(ButtonStyle.Success);
    });
  });

  describe('createDangerButton', () => {
    it('creates danger style button', () => {
      const button = createDangerButton('test_id', 'Danger');
      expect(button.data.style).toBe(ButtonStyle.Danger);
    });
  });
});
