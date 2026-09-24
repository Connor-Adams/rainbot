import express from 'express';
import request from 'supertest';

// api.ts imports these at module load regardless of which route is under test
// (same set sound-search.test.ts mocks for the same reason).
jest.mock('@rainbot/utils', () => ({
  searchSounds: jest.fn(),
  analyzeSound: jest.fn(),
  sweepAnalyzeSounds: jest.fn(),
  deleteAnalysis: jest.fn(),
  enqueueAnalyzeSound: jest.fn(),
}));
jest.mock('@rainbot/utils/storage', () => ({}));
jest.mock('@rainbot/utils/database', () => ({ query: jest.fn() }));

const mockTrackCommand = jest.fn();
jest.mock('@rainbot/utils/statistics', () => ({
  trackCommand: (...args: unknown[]) => mockTrackCommand(...args),
  trackWebEvent: jest.fn(),
}));

jest.mock('../../middleware/auth', () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as express.Request & { user?: unknown }).user = {
      id: 'user-1',
      username: 'tester',
      discriminator: '0001',
    };
    next();
  },
}));

const mockMembersFetch = jest.fn();
jest.mock('../../client', () => ({
  getClient: () => ({
    isReady: () => true,
    guilds: {
      cache: {
        get: (id: string) =>
          id === 'guild-1'
            ? { members: { fetch: (...a: unknown[]) => mockMembersFetch(...a) } }
            : undefined,
      },
    },
  }),
}));

const mockToggleAutoplay = jest.fn();
const mockGetQueue = jest.fn();
jest.mock('../../../lib/multiBotService', () => ({
  __esModule: true,
  default: { isInitialized: () => true },
  getMultiBotService: () => ({
    toggleAutoplay: (...a: unknown[]) => mockToggleAutoplay(...a),
    getQueue: (...a: unknown[]) => mockGetQueue(...a),
  }),
}));

import router from '../api';

describe('POST /api/autoplay', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    mockMembersFetch.mockResolvedValue({ id: 'user-1' });
    mockGetQueue.mockResolvedValue({ queue: [] });
    app = express();
    app.use(express.json());
    app.use('/api', router);
  });

  it('toggles autoplay on and reports the resulting state', async () => {
    mockToggleAutoplay.mockResolvedValue({ success: true, enabled: true });

    const response = await request(app)
      .post('/api/autoplay')
      .send({ guildId: 'guild-1', enabled: true });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'Autoplay enabled', enabled: true });
    expect(mockToggleAutoplay).toHaveBeenCalledWith('guild-1', true);
    expect(mockTrackCommand).toHaveBeenCalledWith(
      'autoplay',
      'user-1',
      'guild-1',
      'api',
      true,
      null,
      'tester',
      '0001'
    );
  });

  it('returns 400 and does not track a command when the worker reports failure', async () => {
    mockToggleAutoplay.mockResolvedValue({ success: false, message: 'Rainbot worker unavailable' });

    const response = await request(app)
      .post('/api/autoplay')
      .send({ guildId: 'guild-1', enabled: false });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Rainbot worker unavailable' });
    expect(mockTrackCommand).not.toHaveBeenCalled();
  });

  it('returns 400 when guildId is missing', async () => {
    const response = await request(app).post('/api/autoplay').send({ enabled: true });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'guildId is required' });
    expect(mockToggleAutoplay).not.toHaveBeenCalled();
  });

  it('returns 400 when enabled is not a boolean', async () => {
    const response = await request(app)
      .post('/api/autoplay')
      .send({ guildId: 'guild-1', enabled: 'yes' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'enabled must be a boolean' });
    expect(mockToggleAutoplay).not.toHaveBeenCalled();
  });
});
