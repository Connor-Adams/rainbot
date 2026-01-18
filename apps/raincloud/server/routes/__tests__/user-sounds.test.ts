import { getUserSoundsHandler } from '../stats';

// Mock the database module used by the handler
jest.mock('@utils/database', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: jest.fn(async (_q: string, _params?: any[]) => {
    return {
      rows: [
        {
          sound_name: 'bruh.mp3',
          is_soundboard: true,
          play_count: 5,
          last_played: new Date().toISOString(),
          avg_duration: 3.5,
        },
      ],
    };
  }),
}));

describe('getUserSoundsHandler', () => {
  it('returns 400 if userId missing', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req: any = { query: {} };
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = { status, json };

    await getUserSoundsHandler(req, res);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ error: 'Missing required query parameter: userId' });
  });

  it('returns sounds for a given userId', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req: any = { query: { userId: '123', limit: '10' } };
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = { status, json };

    await getUserSoundsHandler(req, res);

    expect(json).toHaveBeenCalled();
    const calledWith = json.mock.calls[0][0];
    expect(calledWith).toHaveProperty('sounds');
    expect(Array.isArray(calledWith.sounds)).toBe(true);
    expect(calledWith.sounds[0]).toHaveProperty('sound_name');
  });
});
