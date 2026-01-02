/**
 * Voice Interaction Manager Singleton
 * Provides global access to the voice interaction manager instance
 */

import { VoiceInteractionManager } from './voiceInteractionManager';
import type { VoiceInteractionConfig } from '../../types/voice-interaction';
import { createLogger } from '../logger';

const log = createLogger('VOICE_INTERACTION_INSTANCE');

let instance: VoiceInteractionManager | null = null;

/**
 * Initialize the voice interaction manager
 */
export function initVoiceInteractionManager(config?: Partial<VoiceInteractionConfig>): void {
  if (instance) {
    log.warn('Voice interaction manager already initialized');
    return;
  }

  try {
    log.info('Initializing voice interaction manager...');
    instance = new VoiceInteractionManager(config);
    log.info('Voice interaction manager initialized successfully');
  } catch (error) {
    log.error(`Failed to initialize voice interaction manager: ${(error as Error).message}`);
    log.warn('Voice commands will not be available');
  }
}

/**
 * Get the voice interaction manager instance
 */
export function getVoiceInteractionManager(): VoiceInteractionManager | null {
  if (!instance) {
    log.warn('Voice interaction manager not initialized');
  }
  return instance;
}

/**
 * Check if voice interaction manager is initialized
 */
export function isVoiceInteractionInitialized(): boolean {
  return instance !== null;
}

/**
 * Cleanup voice interaction manager
 */
export async function cleanupVoiceInteraction(): Promise<void> {
  if (!instance) {
    return;
  }

  log.info('Cleaning up voice interaction manager...');

  // Get all guild IDs and cleanup each
  const guildIds = instance.getAllGuildIds();
  for (const guildId of guildIds) {
    await instance.cleanup(guildId);
  }

  instance = null;
  log.info('Voice interaction manager cleaned up');
}
