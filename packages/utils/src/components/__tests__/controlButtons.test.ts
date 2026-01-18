/**
 * Tests for music control buttons
 */

import { ButtonStyle } from 'discord.js';
import {
  createPlayPauseButton,
  createSkipButton,
  createStopButton,
  createQueueButton,
  createMusicControlRow,
  createBasicControlButtons,
} from '../buttons/music/controlButtons';
import type { MusicPlayerState } from '@rainbot/protocol';

describe('Music Control Buttons', () => {
  describe('createPlayPauseButton', () => {
    it('creates pause button when not paused', () => {
      const button = createPlayPauseButton(false);
      expect(button.data.custom_id).toBe('player_pause');
      expect(button.data.label).toBe('Pause');
      expect(button.data.style).toBe(ButtonStyle.Secondary);
    });

    it('creates resume button when paused', () => {
      const button = createPlayPauseButton(true);
      expect(button.data.custom_id).toBe('player_pause');
      expect(button.data.label).toBe('Resume');
      expect(button.data.style).toBe(ButtonStyle.Success);
    });

    it('respects disabled parameter', () => {
      const button = createPlayPauseButton(false, true);
      expect(button.data.disabled).toBe(true);
    });
  });

  describe('createSkipButton', () => {
    it('creates enabled skip button', () => {
      const button = createSkipButton(false);
      expect(button.data.custom_id).toBe('player_skip');
      expect(button.data.label).toBe('Skip');
      expect(button.data.disabled).toBe(false);
    });

    it('creates disabled skip button', () => {
      const button = createSkipButton(true);
      expect(button.data.disabled).toBe(true);
    });
  });

  describe('createStopButton', () => {
    it('creates stop button', () => {
      const button = createStopButton();
      expect(button.data.custom_id).toBe('player_stop');
      expect(button.data.label).toBe('Stop');
      expect(button.data.style).toBe(ButtonStyle.Danger);
    });
  });

  describe('createQueueButton', () => {
    it('creates queue button', () => {
      const button = createQueueButton();
      expect(button.data.custom_id).toBe('player_queue');
      expect(button.data.label).toBe('View Queue');
    });
  });

  describe('createMusicControlRow', () => {
    it('creates control row with all buttons', () => {
      const state: MusicPlayerState = {
        isPaused: false,
        hasQueue: true,
        queueLength: 5,
        canSkip: true,
        nowPlaying: 'Test Song',
      };

      const row = createMusicControlRow(state);
      expect(row.components).toHaveLength(4);
    });

    it('disables skip button when cannot skip', () => {
      const state: MusicPlayerState = {
        isPaused: false,
        hasQueue: false,
        queueLength: 0,
        canSkip: false,
        nowPlaying: 'Test Song',
      };

      const row = createMusicControlRow(state);
      const skipButton = row.components[1]; // Second button is skip
      expect(skipButton.data.disabled).toBe(true);
    });

    it('shows resume button when paused', () => {
      const state: MusicPlayerState = {
        isPaused: true,
        hasQueue: true,
        queueLength: 5,
        canSkip: true,
        nowPlaying: 'Test Song',
      };

      const row = createMusicControlRow(state);
      const pauseButton = row.components[0]; // First button is pause/resume
      expect(pauseButton.data.label).toBe('Resume');
      expect(pauseButton.data.style).toBe(ButtonStyle.Success);
    });
  });

  describe('createBasicControlButtons', () => {
    it('creates basic control row', () => {
      const row = createBasicControlButtons(false, true);
      expect(row.components).toHaveLength(4);
    });

    it('creates row with disabled skip when no queue', () => {
      const row = createBasicControlButtons(false, false);
      const skipButton = row.components[1];
      expect(skipButton.data.disabled).toBe(true);
    });

    it('creates row with resume button when paused', () => {
      const row = createBasicControlButtons(true, true);
      const pauseButton = row.components[0];
      expect(pauseButton.data.label).toBe('Resume');
    });
  });
});
