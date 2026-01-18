/**
 * Music player control buttons
 */

import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import {
  createButton,
  createSuccessButton,
  createSecondaryButton,
  createDangerButton,
} from '@rainbot/utils';
import type { MusicPlayerState } from '@rainbot/protocol';

/**
 * Create play/pause button
 */
export function createPlayPauseButton(isPaused: boolean, disabled: boolean = false): ButtonBuilder {
  if (isPaused) {
    return createSuccessButton('player_pause', 'Resume', '▶️', disabled);
  }
  return createSecondaryButton('player_pause', 'Pause', '⏸️', disabled);
}

/**
 * Create skip button
 */
export function createSkipButton(disabled: boolean = false): ButtonBuilder {
  return createSecondaryButton('player_skip', 'Skip', '⏭️', disabled);
}

/**
 * Create stop button
 */
export function createStopButton(disabled: boolean = false): ButtonBuilder {
  return createDangerButton('player_stop', 'Stop', '⏹️', disabled);
}

/**
 * Create queue view button
 */
export function createQueueButton(disabled: boolean = false): ButtonBuilder {
  return createSecondaryButton('player_queue', 'View Queue', '📋', disabled);
}

/**
 * Create volume up button
 */
export function createVolumeUpButton(disabled: boolean = false): ButtonBuilder {
  return createSecondaryButton('player_volume_up', 'Volume +', '🔊', disabled);
}

/**
 * Create volume down button
 */
export function createVolumeDownButton(disabled: boolean = false): ButtonBuilder {
  return createSecondaryButton('player_volume_down', 'Volume -', '🔉', disabled);
}

/**
 * Create a complete music control row
 */
export function createMusicControlRow(state: MusicPlayerState): ActionRowBuilder<ButtonBuilder> {
  const { isPaused, canSkip } = state;

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    createPlayPauseButton(isPaused),
    createSkipButton(!canSkip),
    createStopButton(),
    createQueueButton()
  );
}

/**
 * Create volume control buttons row (optional second row)
 */
export function createVolumeControlRow(
  currentVolume: number = 100
): ActionRowBuilder<ButtonBuilder> {
  const atMax = currentVolume >= 200;
  const atMin = currentVolume <= 0;

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    createVolumeDownButton(atMin),
    createButton(
      'player_volume_display',
      `Volume: ${currentVolume}%`,
      ButtonStyle.Secondary,
      '🔊',
      true // Always disabled, just for display
    ),
    createVolumeUpButton(atMax)
  );
}

/**
 * Create basic control buttons (backward compatible with existing system)
 */
export function createBasicControlButtons(
  isPaused: boolean = false,
  hasQueue: boolean = false
): ActionRowBuilder<ButtonBuilder> {
  return createMusicControlRow({
    isPaused,
    hasQueue,
    queueLength: hasQueue ? 1 : 0,
    canSkip: hasQueue,
    nowPlaying: null,
  });
}
