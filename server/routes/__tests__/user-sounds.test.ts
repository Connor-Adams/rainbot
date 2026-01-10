import { getUserSoundsHandler } from '../stats';
import { assertEquals, assert, assertThrows, assertRejects } from '@std/assert';

// Mock implementations for testing
let mockQueryResult = {
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

// Mock the database module
const originalDatabase = await import('../../../utils/database');
const mockQuery = async () => mockQueryResult;

// Apply mock
Object.defineProperty(await import('../../../utils/database'), 'query', {
  value: mockQuery,
  writable: true,
});

// getUserSoundsHandler tests
Deno.test('getUserSoundsHandler - returns 400 if userId missing', async () => {
  const req: any = { query: {} };
  let statusCode = 0;
  let responseData: any = null;
  const res: any = {
    status: (code: number) => ({
      json: (data: any) => {
        statusCode = code;
        responseData = data;
      },
    }),
  };

  await getUserSoundsHandler(req, res);

  assertEquals(statusCode, 400);
  assertEquals(responseData.error, 'Missing required query parameter: userId');
});

Deno.test('getUserSoundsHandler - returns sounds for a given userId', async () => {
  const req: any = { query: { userId: '123', limit: '10' } };
  let responseData: any = null;
  const res: any = {
    status: () => ({
      json: (data: any) => {
        responseData = data;
      },
    }),
  };

  await getUserSoundsHandler(req, res);

  assert(responseData);
  assert(responseData.sounds);
  assert(Array.isArray(responseData.sounds));
  assert(responseData.sounds[0].sound_name);
});
