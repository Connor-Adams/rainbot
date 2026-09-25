/**
 * Tests for ChannelResolver — in particular that Discord's live voice state,
 * not Redis, is the source of truth for "is this user in a voice channel".
 */

import { ChannelResolver } from '../channelResolver';
import type { VoiceStateManager } from '../voiceStateManager';
import type { Client } from 'discord.js';

const GUILD = 'guild-1';
const USER = 'user-1';

function createVoiceStateManager(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    getCurrentChannel: jest.fn().mockResolvedValue(null),
    getActiveSession: jest.fn().mockResolvedValue(null),
    getLastChannel: jest.fn().mockResolvedValue(null),
    setCurrentChannel: jest.fn().mockResolvedValue(undefined),
    setLastChannel: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as VoiceStateManager & {
    getCurrentChannel: jest.Mock;
    getActiveSession: jest.Mock;
    getLastChannel: jest.Mock;
    setCurrentChannel: jest.Mock;
    setLastChannel: jest.Mock;
  };
}

/** Minimal Client stand-in: one guild whose voiceStates cache we control. */
function createClient(voiceStates: Record<string, string | null>) {
  const guild = {
    id: GUILD,
    voiceStates: {
      cache: new Map(
        Object.entries(voiceStates).map(([userId, channelId]) => [userId, { channelId }])
      ),
    },
    channels: { cache: new Map() },
  };
  return {
    user: { id: 'bot' },
    guilds: { cache: new Map([[GUILD, guild]]) },
  } as unknown as Client;
}

describe('ChannelResolver.resolveTargetChannel', () => {
  it('uses the live Discord voice state even when Redis knows nothing about the user', async () => {
    const vsm = createVoiceStateManager();
    const resolver = new ChannelResolver(vsm, createClient({ [USER]: 'voice-live' }));

    const result = await resolver.resolveTargetChannel(GUILD, USER);

    expect(result).toEqual({ channelId: 'voice-live' });
    expect(vsm.getCurrentChannel).not.toHaveBeenCalled();
  });

  it('write-through caches the live channel so later fallbacks stay warm', async () => {
    const vsm = createVoiceStateManager();
    const resolver = new ChannelResolver(vsm, createClient({ [USER]: 'voice-live' }));

    await resolver.resolveTargetChannel(GUILD, USER);

    expect(vsm.setCurrentChannel).toHaveBeenCalledWith(GUILD, USER, 'voice-live');
    expect(vsm.setLastChannel).toHaveBeenCalledWith(GUILD, USER, 'voice-live');
  });

  it('still resolves when the write-through cache update fails', async () => {
    const vsm = createVoiceStateManager({
      setCurrentChannel: jest.fn().mockRejectedValue(new Error('redis down')),
    });
    const resolver = new ChannelResolver(vsm, createClient({ [USER]: 'voice-live' }));

    await expect(resolver.resolveTargetChannel(GUILD, USER)).resolves.toEqual({
      channelId: 'voice-live',
    });
  });

  it('ignores a stale Redis current channel when Discord says the user left voice', async () => {
    const vsm = createVoiceStateManager({
      getCurrentChannel: jest.fn().mockResolvedValue('stale-channel'),
      getActiveSession: jest.fn().mockResolvedValue({ channelId: 'session-channel' }),
    });
    const resolver = new ChannelResolver(vsm, createClient({}));

    const result = await resolver.resolveTargetChannel(GUILD, USER);

    expect(result).toEqual({
      channelId: 'session-channel',
      activeChannelId: 'session-channel',
    });
  });

  it('falls back to the Redis current channel when the guild is not cached', async () => {
    const vsm = createVoiceStateManager({
      getCurrentChannel: jest.fn().mockResolvedValue('redis-channel'),
    });
    const resolver = new ChannelResolver(vsm); // no client at all

    const result = await resolver.resolveTargetChannel(GUILD, USER);

    expect(result).toEqual({ channelId: 'redis-channel' });
  });

  it('reports NO_CHANNEL when neither Discord nor Redis knows a channel', async () => {
    const vsm = createVoiceStateManager();
    const resolver = new ChannelResolver(vsm, createClient({}));

    const result = await resolver.resolveTargetChannel(GUILD, USER);

    expect(result).toEqual({
      error: 'NO_CHANNEL',
      message: 'Please join a voice channel first.',
    });
  });
});
