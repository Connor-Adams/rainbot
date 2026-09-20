const mockListSounds = jest.fn();
const mockSearchSounds = jest.fn();
const mockTrackInteraction = jest.fn();

jest.mock('discord.js', () => ({
  Events: { InteractionCreate: 'interactionCreate' },
  MessageFlags: { Ephemeral: 64 },
}));
jest.mock('@rainbot/utils/logger', () => ({
  createLogger: () => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  }),
}));
jest.mock('@rainbot/utils/storage', () => ({
  listSounds: (...args: unknown[]) => mockListSounds(...args),
}));
jest.mock('@rainbot/utils/statistics', () => ({
  trackInteraction: (...args: unknown[]) => mockTrackInteraction(...args),
  trackCommand: jest.fn(),
}));
jest.mock('@rainbot/utils', () => ({
  searchSounds: (...args: unknown[]) => mockSearchSounds(...args),
}));

 
const { handlePlaySourceAutocomplete } = require('../interactionCreate');

function makeInteraction(focusedValue: string) {
  const respond = jest.fn(async () => undefined);
  return {
    respond,
    id: 'interaction-1',
    guildId: 'guild-1',
    channelId: 'channel-1',
    user: { id: 'user-1', username: 'connor' },
    options: { getFocused: () => ({ name: 'source', value: focusedValue }) },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListSounds.mockResolvedValue([
    { name: 'airhorn.ogg', size: 1, createdAt: new Date() },
    { name: 'bruh.ogg', size: 1, createdAt: new Date() },
  ]);
  mockSearchSounds.mockResolvedValue([
    { name: 'airhorn.ogg', snippet: 'a loud air horn blast' },
    { name: 'bruh.ogg', snippet: null },
  ]);
});

describe('handlePlaySourceAutocomplete', () => {
  it('answers with choices built from the sound list', async () => {
    const interaction = makeInteraction('  horn  ');

    await handlePlaySourceAutocomplete(interaction, Date.now());

    expect(mockListSounds).toHaveBeenCalledTimes(1);
    expect(interaction.respond).toHaveBeenCalledWith([
      { name: 'airhorn.ogg — a loud air horn blast', value: 'airhorn.ogg' },
      { name: 'bruh.ogg', value: 'bruh.ogg' },
    ]);
  });

  it('searches the trimmed input against the listed sounds without semantics', async () => {
    await handlePlaySourceAutocomplete(makeInteraction('  horn  '), Date.now());

    expect(mockSearchSounds).toHaveBeenCalledWith({
      query: 'horn',
      sounds: [{ name: 'airhorn.ogg' }, { name: 'bruh.ogg' }],
      limit: 25,
      allowSemantic: false,
    });
  });

  it('tracks a successful autocomplete', async () => {
    await handlePlaySourceAutocomplete(makeInteraction('horn'), Date.now());

    expect(mockTrackInteraction).toHaveBeenCalledTimes(1);
    const call = mockTrackInteraction.mock.calls[0];
    expect(call[0]).toBe('autocomplete');
    expect(call[2]).toBe('play_source');
    expect(call[8]).toBe(true);
    expect(call[9]).toBeNull();
    expect(call[10]).toEqual({ query: 'horn', resultsShown: 2, totalSounds: 2 });
  });

  it('caps a long choice label at Discord’s 100 character limit', async () => {
    mockSearchSounds.mockResolvedValue([{ name: 'long.ogg', snippet: 'x'.repeat(200) }]);

    const interaction = makeInteraction('long');
    await handlePlaySourceAutocomplete(interaction, Date.now());

    const [choices] = interaction.respond.mock.calls[0] as unknown as [
      Array<{ name: string; value: string }>,
    ];
    expect(choices[0]!.name).toHaveLength(100);
    expect(choices[0]!.name.endsWith('...')).toBe(true);
  });

  it('answers with an empty list and records the failure when listing throws', async () => {
    mockListSounds.mockRejectedValue(new Error('storage down'));

    const interaction = makeInteraction('horn');
    await handlePlaySourceAutocomplete(interaction, Date.now());

    expect(interaction.respond).toHaveBeenCalledWith([]);
    const call = mockTrackInteraction.mock.calls[0];
    expect(call[8]).toBe(false);
    expect(call[9]).toBe('storage down');
  });
});
