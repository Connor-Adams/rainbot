import { RainbotAttr } from '@rainbot/observability/node';

jest.mock('@rainbot/observability/node', () => ({
  ...jest.requireActual('@rainbot/observability/node'),
  recordSoundPlay: jest.fn(),
}));

jest.mock('@rainbot/worker-shared', () => ({
  reportSoundStat: jest.fn(),
  createJoinHandler: jest.fn(() => jest.fn()),
  createLeaveHandler: jest.fn(() => jest.fn()),
  createVolumeHandler: jest.fn(() => jest.fn()),
  createPlaySoundHandler: jest.fn((options: unknown) => options),
  createCleanupUserHandler: jest.fn(() => jest.fn()),
  sniffSoundStream: jest.fn(),
}));

jest.mock('../../storage/sounds', () => ({
  getSoundStream: jest.fn(),
}));

import { recordSoundPlay } from '@rainbot/observability/node';
import { createPlaySoundHandler, sniffSoundStream } from '@rainbot/worker-shared';
import { getSoundStream } from '../../storage/sounds';
import { createRpcHandlers } from '../rpc';

describe('hungerbot sound.play R2/local fetch timing', () => {
  beforeEach(() => jest.clearAllMocks());

  it('times getSoundStream separately from sniffing/playback and records phase=fetch', async () => {
    const fakeStream = { fake: 'raw-stream' };
    const sniffed = { stream: fakeStream, inputType: 'ogg/opus' };
    (getSoundStream as jest.Mock).mockResolvedValue(fakeStream);
    (sniffSoundStream as jest.Mock).mockResolvedValue(sniffed);

    createRpcHandlers({ client: {} as never, requestCache: new Map() as never });

    // createPlaySoundHandler (from worker-shared, mocked above to just
    // return its options) was called once when building the RPC handlers;
    // pull out the createSoundResource callback hungerbot wired into it.
    expect(createPlaySoundHandler).toHaveBeenCalledTimes(1);
    const options = (createPlaySoundHandler as jest.Mock).mock.calls[0][0] as {
      createSoundResource: (input: { sfxId: string }) => Promise<unknown>;
    };

    const result = await options.createSoundResource({ sfxId: 'airhorn' });

    expect(getSoundStream).toHaveBeenCalledWith('airhorn');
    expect(sniffSoundStream).toHaveBeenCalledWith(fakeStream);
    expect(result).toBe(sniffed);
    // No RainbotAttr.sound on the metric: it's a user-uploaded R2 object key
    // and this is a histogram, so per-sound cardinality would grow unbounded.
    expect(recordSoundPlay).toHaveBeenCalledWith(expect.any(Number), {
      [RainbotAttr.phase]: 'fetch',
    });
    const recordedAttrs = (recordSoundPlay as jest.Mock).mock.calls[0][1];
    expect(recordedAttrs).not.toHaveProperty(RainbotAttr.sound);
  });

  it('does not record a fetch duration when the fetch itself fails (no clean-looking metric on a real failure)', async () => {
    const boom = new Error('Sound file not found: airhorn.mp3');
    (getSoundStream as jest.Mock).mockRejectedValue(boom);

    createRpcHandlers({ client: {} as never, requestCache: new Map() as never });
    const options = (createPlaySoundHandler as jest.Mock).mock.calls[0][0] as {
      createSoundResource: (input: { sfxId: string }) => Promise<unknown>;
    };

    await expect(options.createSoundResource({ sfxId: 'airhorn' })).rejects.toBe(boom);
    expect(recordSoundPlay).not.toHaveBeenCalled();
  });
});
