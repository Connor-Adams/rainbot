import { RainbotAttr } from '@rainbot/observability/node';

jest.mock('@rainbot/observability/node', () => ({
  ...jest.requireActual('@rainbot/observability/node'),
  recordVoiceConnections: jest.fn(),
}));

import { recordVoiceConnections } from '@rainbot/observability/node';
import { markVoiceConnected, markVoiceDisconnected } from '../voiceConnectionMetrics';
import type { VoiceConnection } from '@discordjs/voice';

describe('voice connection gauge accounting', () => {
  beforeEach(() => jest.clearAllMocks());

  it('increments once and is a no-op on a repeated connect for the same connection object', () => {
    const connection = {} as VoiceConnection;

    markVoiceConnected(connection, 'guild-1');
    markVoiceConnected(connection, 'guild-1');

    expect(recordVoiceConnections).toHaveBeenCalledTimes(1);
    expect(recordVoiceConnections).toHaveBeenCalledWith(1, { [RainbotAttr.guildId]: 'guild-1' });
  });

  it('decrements exactly once even when multiple teardown paths report the same connection', () => {
    const connection = {} as VoiceConnection;
    markVoiceConnected(connection, 'guild-1');

    // e.g. the 'error' listener destroys the connection, and the
    // Disconnected-retry-failure listener also fires for it afterwards.
    markVoiceDisconnected(connection, 'guild-1');
    markVoiceDisconnected(connection, 'guild-1');

    expect(recordVoiceConnections).toHaveBeenCalledTimes(2);
    expect(recordVoiceConnections).toHaveBeenNthCalledWith(1, 1, {
      [RainbotAttr.guildId]: 'guild-1',
    });
    expect(recordVoiceConnections).toHaveBeenNthCalledWith(2, -1, {
      [RainbotAttr.guildId]: 'guild-1',
    });
  });

  it('never decrements a connection that was never counted', () => {
    const connection = {} as VoiceConnection;

    markVoiceDisconnected(connection, 'guild-1');

    expect(recordVoiceConnections).not.toHaveBeenCalled();
  });

  it('tracks distinct connection objects independently', () => {
    const a = {} as VoiceConnection;
    const b = {} as VoiceConnection;

    markVoiceConnected(a, 'guild-1');
    markVoiceConnected(b, 'guild-2');
    markVoiceDisconnected(a, 'guild-1');

    expect(recordVoiceConnections).toHaveBeenCalledTimes(3);
    expect(recordVoiceConnections).toHaveBeenNthCalledWith(3, -1, {
      [RainbotAttr.guildId]: 'guild-1',
    });
    // b was never disconnected, so only one -1 should ever be recorded.
    expect(recordVoiceConnections).not.toHaveBeenCalledWith(-1, {
      [RainbotAttr.guildId]: 'guild-2',
    });
  });
});
