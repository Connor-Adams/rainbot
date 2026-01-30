import express from 'express';
import request from 'supertest';

const ENV_BACKUP = { ...process.env };

// Mock dependencies
jest.mock('@utils/database', () => ({
  query: jest.fn(async () => ({ rows: [] })),
}));

jest.mock('@utils/statistics', () => ({
  statsEmitter: {
    on: jest.fn(),
    off: jest.fn(),
  },
}));

jest.mock('../../middleware/auth', () => ({
  requireAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
}));

describe('Stats Rate Limiting', () => {
  let app: express.Application;
  let statsRouter: express.Router;
  let unauthRateLimiter: express.RequestHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env['UNAUTH_RATE_LIMIT_WINDOW_MS'] = '1000';
    process.env['UNAUTH_RATE_LIMIT_MAX'] = '5';
    // Dynamically import the stats router to get a fresh instance
    jest.isolateModules(() => {
      statsRouter = require('../stats').default;
      unauthRateLimiter = require('../../middleware/unauthRateLimit').unauthRateLimiter;
    });
    app = express();
    app.use(express.json());
    app.use(unauthRateLimiter);
    app.use('/api/stats', statsRouter);
  });

  afterEach(() => {
    process.env = { ...ENV_BACKUP };
  });

  it('allows requests under the rate limit', async () => {
    const response = await request(app).get('/api/stats/summary');
    expect(response.status).not.toBe(429); // Should not be rate limited
  });

  it('enforces rate limit after excessive requests', async () => {
    // Make many requests to trigger rate limit (more than 5)
    const requests = [];
    for (let i = 0; i < 7; i++) {
      requests.push(request(app).get('/api/stats/summary'));
    }

    const responses = await Promise.all(requests);
    const rateLimited = responses.some((res) => res.status === 429);

    // At least one request should be rate limited
    expect(rateLimited).toBe(true);
  });

  it('includes rate limit headers in response', async () => {
    const response = await request(app).get('/api/stats/summary');

    // Should include RateLimit headers
    expect(response.headers).toHaveProperty('ratelimit-limit');
    expect(response.headers).toHaveProperty('ratelimit-remaining');
    expect(response.headers).toHaveProperty('ratelimit-reset');
  });

  it('applies rate limiting to all stats endpoints', async () => {
    const endpoints = [
      '/api/stats/summary',
      '/api/stats/commands',
      '/api/stats/sounds',
      '/api/stats/users',
      '/api/stats/guilds',
      '/api/stats/time',
      '/api/stats/queue',
    ];

    for (const endpoint of endpoints) {
      const response = await request(app).get(endpoint);
      // Each should have rate limit headers
      expect(response.headers).toHaveProperty('ratelimit-limit');
    }
  });
});
