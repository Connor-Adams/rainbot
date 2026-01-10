/**
 * Tests for music control buttons
 */

import { ButtonStyle } from 'npm:discord.js@14.15.3';
import {
  createPlayPauseButton,
  createSkipButton,
  createStopButton,
  createQueueButton,
  createMusicControlRow,
  createBasicControlButtons,
} from '../buttons/music/controlButtons.ts';
import type { MusicPlayerState } from '../../types/buttons.ts';
import { assertEquals, assert, assertThrows, assertRejects } from '@std/assert';

// Music Control Buttons tests
// createPlayPauseButton tests
Deno.test('controlButtons - createPlayPauseButton - creates pause button when not paused', () => {
  const button = createPlayPauseButton(false);
  const data = button.toJSON() as any;
  assertEquals(data.custom_id, 'player_pause');
  assertEquals(data.label, 'Pause');
  assertEquals(data.style, ButtonStyle.Secondary);
});

Deno.test('controlButtons - createPlayPauseButton - creates resume button when paused', () => {
  const button = createPlayPauseButton(true);
  const data = button.toJSON() as any;
  assertEquals(data.custom_id, 'player_pause');
  assertEquals(data.label, 'Resume');
  assertEquals(data.style, ButtonStyle.Success);
});

Deno.test('controlButtons - createPlayPauseButton - respects disabled parameter', () => {
  const button = createPlayPauseButton(false, true);
  const data = button.toJSON() as any;
  assertEquals(data.disabled, true);
});

// createSkipButton tests
Deno.test('controlButtons - createSkipButton - creates enabled skip button', () => {
  const button = createSkipButton(false);
  const data = button.toJSON() as any;
  assertEquals(data.custom_id, 'player_skip');
  assertEquals(data.label, 'Skip');
  assertEquals(data.disabled, false);
});

Deno.test('controlButtons - createSkipButton - creates disabled skip button', () => {
  const button = createSkipButton(true);
  const data = button.toJSON() as any;
  assertEquals(data.disabled, true);
});

// createStopButton tests
Deno.test('controlButtons - createStopButton - creates stop button', () => {
  const button = createStopButton();
  const data = button.toJSON() as any;
  assertEquals(data.custom_id, 'player_stop');
  assertEquals(data.label, 'Stop');
  assertEquals(data.style, ButtonStyle.Danger);
});

// createQueueButton tests
Deno.test('controlButtons - createQueueButton - creates queue button', () => {
  const button = createQueueButton();
  const data = button.toJSON() as any;
  assertEquals(data.custom_id, 'player_queue');
  assertEquals(data.label, 'View Queue');
});

// createMusicControlRow tests
Deno.test('controlButtons - createMusicControlRow - creates control row with all buttons', () => {
  const state: MusicPlayerState = {
    isPaused: false,
    hasQueue: true,
    queueLength: 5,
    canSkip: true,
    nowPlaying: 'Test Song',
  };

  const row = createMusicControlRow(state);
  assertEquals(row.components.length, 4);
});

Deno.test('controlButtons - createMusicControlRow - disables skip button when cannot skip', () => {
  const state: MusicPlayerState = {
    isPaused: false,
    hasQueue: false,
    queueLength: 0,
    canSkip: false,
    nowPlaying: 'Test Song',
  };

  const row = createMusicControlRow(state);
  const skipButton = row.components[1] as any; // Second button is skip
  assertEquals(skipButton.data.disabled, true);
});

Deno.test('controlButtons - createMusicControlRow - shows resume button when paused', () => {
  const state: MusicPlayerState = {
    isPaused: true,
    hasQueue: true,
    queueLength: 5,
    canSkip: true,
    nowPlaying: 'Test Song',
  };

  const row = createMusicControlRow(state);
  const pauseButton = row.components[0] as any; // First button is pause/resume
  assertEquals(pauseButton.data.label, 'Resume');
  assertEquals(pauseButton.data.style, ButtonStyle.Success);
});

// createBasicControlButtons tests
Deno.test('controlButtons - createBasicControlButtons - creates basic control row', () => {
  const row = createBasicControlButtons(false, true);
  assertEquals(row.components.length, 4);
});

Deno.test(
  'controlButtons - createBasicControlButtons - creates row with disabled skip when no queue',
  () => {
    const row = createBasicControlButtons(false, false);
    const skipButton = row.components[1] as any;
    assertEquals(skipButton.data.disabled, true);
  }
);

Deno.test(
  'controlButtons - createBasicControlButtons - creates row with resume button when paused',
  () => {
    const row = createBasicControlButtons(true, true);
    const pauseButton = row.components[0] as any;
    assertEquals(pauseButton.data.label, 'Resume');
  }
);
