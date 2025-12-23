const { query } = require('./database');
const { createLogger } = require('./logger');

const log = createLogger('STATS');

// Batch processing configuration
const BATCH_SIZE = 100;
const BATCH_INTERVAL = 5000; // 5 seconds

// Event buffers for batch processing
const commandBuffer = [];
const soundBuffer = [];
const queueBuffer = [];
const voiceBuffer = [];

/** @type {Object<string, Array>} Map buffer type to buffer array */
const bufferMap = {
  commands: commandBuffer,
  sounds: soundBuffer,
  queue: queueBuffer,
  voice: voiceBuffer,
};

let batchTimer = null;

/**
 * Start batch processing timer
 */
function startBatchProcessor() {
  if (batchTimer) return;

  batchTimer = setInterval(async () => {
    await flushBatches();
  }, BATCH_INTERVAL);

  log.debug('Batch processor started');
}

/**
 * Flush all buffered events to database (parallel inserts)
 */
async function flushBatches() {
  const batches = [
    { name: 'commands', buffer: commandBuffer, table: 'command_stats' },
    { name: 'sounds', buffer: soundBuffer, table: 'sound_stats' },
    { name: 'queue', buffer: queueBuffer, table: 'queue_operations' },
    { name: 'voice', buffer: voiceBuffer, table: 'voice_events' },
  ];

  // Collect non-empty batches
  const insertPromises = [];
  for (const { name, buffer, table } of batches) {
    if (buffer.length === 0) continue;

    const events = buffer.splice(0, BATCH_SIZE);
    insertPromises.push(insertBatch(name, table, events));
  }

  // Run all inserts in parallel
  if (insertPromises.length > 0) {
    await Promise.all(insertPromises);
  }
}

/**
 * Insert a batch of events into the database
 */
async function insertBatch(type, table, events) {
  if (events.length === 0) return;

  try {
    if (table === 'command_stats') {
      const values = events
        .map(
          (_, i) =>
            `($${i * 9 + 1}, $${i * 9 + 2}, $${i * 9 + 3}, $${i * 9 + 4}, $${i * 9 + 5}, $${i * 9 + 6}, $${i * 9 + 7}, $${i * 9 + 8}, $${i * 9 + 9})`
        )
        .join(', ');

      const params = events.flatMap((e) => [
        e.command_name,
        e.user_id,
        e.username || null,
        e.discriminator || null,
        e.guild_id,
        e.source,
        e.executed_at || new Date(),
        e.success,
        e.error_message || null,
      ]);

      await query(
        `INSERT INTO command_stats (command_name, user_id, username, discriminator, guild_id, source, executed_at, success, error_message) VALUES ${values}`,
        params
      );

      await upsertUserProfiles(events);
    } else if (table === 'sound_stats') {
      const values = events
        .map(
          (_, i) =>
            `($${i * 10 + 1}, $${i * 10 + 2}, $${i * 10 + 3}, $${i * 10 + 4}, $${i * 10 + 5}, $${i * 10 + 6}, $${i * 10 + 7}, $${i * 10 + 8}, $${i * 10 + 9}, $${i * 10 + 10})`
        )
        .join(', ');

      const params = events.flatMap((e) => [
        e.sound_name,
        e.user_id,
        e.username || null,
        e.discriminator || null,
        e.guild_id,
        e.source_type,
        e.is_soundboard,
        e.played_at || new Date(),
        e.duration || null,
        e.source,
      ]);

      await query(
        `INSERT INTO sound_stats (sound_name, user_id, username, discriminator, guild_id, source_type, is_soundboard, played_at, duration, source) VALUES ${values}`,
        params
      );

      await upsertUserProfiles(events);
    } else if (table === 'queue_operations') {
      const values = events
        .map(
          (_, i) =>
            `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`
        )
        .join(', ');

      const params = events.flatMap((e) => [
        e.operation_type,
        e.user_id,
        e.guild_id,
        e.executed_at || new Date(),
        e.source,
        e.metadata ? JSON.stringify(e.metadata) : null,
      ]);

      await query(
        `INSERT INTO queue_operations (operation_type, user_id, guild_id, executed_at, source, metadata) VALUES ${values}`,
        params
      );
    } else if (table === 'voice_events') {
      const values = events
        .map(
          (_, i) =>
            `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`
        )
        .join(', ');

      const params = events.flatMap((e) => [
        e.event_type,
        e.guild_id,
        e.channel_id,
        e.channel_name || null,
        e.executed_at || new Date(),
        e.source,
      ]);

      await query(
        `INSERT INTO voice_events (event_type, guild_id, channel_id, channel_name, executed_at, source) VALUES ${values}`,
        params
      );
    }

    log.debug(`Inserted ${events.length} ${type} events`);
  } catch (error) {
    log.error(`Failed to insert ${type} batch: ${error.message}`);
    // Put events back in buffer to retry later (but limit buffer size)
    const buffer = bufferMap[type];
    if (buffer && buffer.length < BATCH_SIZE * 10) {
      buffer.unshift(...events);
    }
  }
}

/**
 * Upsert user profiles for username lookup
 */
async function upsertUserProfiles(events) {
  const profilesById = new Map();

  for (const event of events) {
    if (!event.user_id) continue;
    if (!event.username && !event.discriminator) continue;

    profilesById.set(event.user_id, {
      user_id: event.user_id,
      username: event.username || null,
      discriminator: event.discriminator || null,
    });
  }

  if (profilesById.size === 0) return;

  const profiles = Array.from(profilesById.values());
  const values = profiles
    .map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`)
    .join(', ');

  const params = profiles.flatMap((profile) => [
    profile.user_id,
    profile.username,
    profile.discriminator,
    new Date(),
  ]);

  try {
    await query(
      `INSERT INTO user_profiles (user_id, username, discriminator, updated_at) VALUES ${values}
             ON CONFLICT (user_id) DO UPDATE SET
                 username = COALESCE(EXCLUDED.username, user_profiles.username),
                 discriminator = COALESCE(EXCLUDED.discriminator, user_profiles.discriminator),
                 updated_at = EXCLUDED.updated_at`,
      params
    );
  } catch (error) {
    log.error(`Failed to upsert user profiles: ${error.message}`);
  }
}

/**
 * Track a command execution
 * @param {string} commandName - Name of the command
 * @param {string} userId - Discord user ID
 * @param {string} guildId - Discord guild ID
 * @param {string} source - 'discord' or 'api'
 * @param {boolean} success - Whether command succeeded
 * @param {string} errorMessage - Error message if failed
 * @param {string} username - Discord username (optional)
 * @param {string} discriminator - Discord discriminator (optional)
 */
function trackCommand(
  commandName,
  userId,
  guildId,
  source = 'discord',
  success = true,
  errorMessage = null,
  username = null,
  discriminator = null
) {
  if (!commandName || !userId || !guildId) {
    log.debug('Invalid command tracking data, skipping');
    return;
  }

  try {
    commandBuffer.push({
      command_name: commandName,
      user_id: userId,
      guild_id: guildId,
      username,
      discriminator,
      source: source === 'api' ? 'api' : 'discord',
      executed_at: new Date(),
      success,
      error_message: errorMessage,
    });

    // Flush if buffer is full
    if (commandBuffer.length >= BATCH_SIZE) {
      flushBatches().catch((err) => log.error(`Error flushing batches: ${err.message}`));
    }

    startBatchProcessor();
  } catch (error) {
    log.error(`Error tracking command: ${error.message}`);
  }
}

/**
 * Track sound playback
 * @param {string} soundName - Name of the sound/track
 * @param {string} userId - Discord user ID
 * @param {string} guildId - Discord guild ID
 * @param {string} sourceType - 'local', 'youtube', 'spotify', 'soundcloud', 'other'
 * @param {boolean} isSoundboard - Whether this is a soundboard overlay
 * @param {number} duration - Duration in seconds (optional)
 * @param {string} source - 'discord' or 'api'
 * @param {string} username - Discord username (optional)
 * @param {string} discriminator - Discord discriminator (optional)
 */
function trackSound(
  soundName,
  userId,
  guildId,
  sourceType = 'other',
  isSoundboard = false,
  duration = null,
  source = 'discord',
  username = null,
  discriminator = null
) {
  if (!soundName || !userId || !guildId) {
    log.debug('Invalid sound tracking data, skipping');
    return;
  }

  try {
    soundBuffer.push({
      sound_name: soundName,
      user_id: userId,
      guild_id: guildId,
      username,
      discriminator,
      source_type: sourceType,
      is_soundboard: isSoundboard,
      played_at: new Date(),
      duration,
      source: source === 'api' ? 'api' : 'discord',
    });

    // Flush if buffer is full
    if (soundBuffer.length >= BATCH_SIZE) {
      flushBatches().catch((err) => log.error(`Error flushing batches: ${err.message}`));
    }

    startBatchProcessor();
  } catch (error) {
    log.error(`Error tracking sound: ${error.message}`);
  }
}

/**
 * Track queue operation
 * @param {string} operationType - 'skip', 'pause', 'resume', 'clear', 'remove'
 * @param {string} userId - Discord user ID
 * @param {string} guildId - Discord guild ID
 * @param {string} source - 'discord' or 'api'
 * @param {object} metadata - Additional metadata (e.g., skip count, track index)
 */
function trackQueueOperation(operationType, userId, guildId, source = 'discord', metadata = null) {
  if (!operationType || !userId || !guildId) {
    log.debug('Invalid queue operation tracking data, skipping');
    return;
  }

  try {
    queueBuffer.push({
      operation_type: operationType,
      user_id: userId,
      guild_id: guildId,
      executed_at: new Date(),
      source: source === 'api' ? 'api' : 'discord',
      metadata,
    });

    // Flush if buffer is full
    if (queueBuffer.length >= BATCH_SIZE) {
      flushBatches().catch((err) => log.error(`Error flushing batches: ${err.message}`));
    }

    startBatchProcessor();
  } catch (error) {
    log.error(`Error tracking queue operation: ${error.message}`);
  }
}

/**
 * Track voice event
 * @param {string} eventType - 'join' or 'leave'
 * @param {string} guildId - Discord guild ID
 * @param {string} channelId - Discord channel ID
 * @param {string} channelName - Channel name (optional)
 * @param {string} source - 'discord' or 'api'
 */
function trackVoiceEvent(eventType, guildId, channelId, channelName = null, source = 'discord') {
  if (!eventType || !guildId || !channelId) {
    log.debug('Invalid voice event tracking data, skipping');
    return;
  }

  try {
    voiceBuffer.push({
      event_type: eventType,
      guild_id: guildId,
      channel_id: channelId,
      channel_name: channelName,
      executed_at: new Date(),
      source: source === 'api' ? 'api' : 'discord',
    });

    // Flush if buffer is full
    if (voiceBuffer.length >= BATCH_SIZE) {
      flushBatches().catch((err) => log.error(`Error flushing batches: ${err.message}`));
    }

    startBatchProcessor();
  } catch (error) {
    log.error(`Error tracking voice event: ${error.message}`);
  }
}

/**
 * Flush all pending events (useful for graceful shutdown)
 */
async function flushAll() {
  await flushBatches();
  if (batchTimer) {
    clearInterval(batchTimer);
    batchTimer = null;
  }
}

module.exports = {
  trackCommand,
  trackSound,
  trackQueueOperation,
  trackVoiceEvent,
  flushAll,
};
