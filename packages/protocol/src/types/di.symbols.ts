/**
 * Dependency Injection symbols for InversifyJS
 */

export const TYPES = {
  // Core
  Client: Symbol.for('Client'),
  Config: Symbol.for('Config'),
  Logger: Symbol.for('Logger'),

  // Services
  DatabaseService: Symbol.for('DatabaseService'),
  CacheService: Symbol.for('CacheService'),
  VoiceManagerService: Symbol.for('VoiceManagerService'),
  StatisticsService: Symbol.for('StatisticsService'),
  AudioService: Symbol.for('AudioService'),
  StorageService: Symbol.for('StorageService'),
  ConfigService: Symbol.for('ConfigService'),

  // Repositories (if needed)
  CommandRepository: Symbol.for('CommandRepository'),
  SoundRepository: Symbol.for('SoundRepository'),
};
