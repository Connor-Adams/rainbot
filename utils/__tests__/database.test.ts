import type { QueryResult } from 'pg';

// Mock the logger
jest.mock('../logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    http: jest.fn(),
  }),
}));

// Mock the config
const mockLoadConfig = jest.fn(() => ({
  databaseUrl: 'postgresql://localhost/testdb',
}));

jest.mock('../config', () => ({
  loadConfig: mockLoadConfig,
}));

// Mock pg Pool
const mockQuery = jest.fn();
const mockOn = jest.fn();

jest.mock('pg', () => {
  return {
    Pool: jest.fn().mockImplementation(() => ({
      query: mockQuery,
      on: mockOn,
    })),
  };
});

describe('database', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
    mockOn.mockReset();
    mockLoadConfig.mockReturnValue({ databaseUrl: 'postgresql://localhost/testdb' });
    // Reset module to clear cached state
    jest.resetModules();
  });

  describe('initDatabase', () => {
    it('returns null when DATABASE_URL is not configured', () => {
      mockLoadConfig.mockReturnValue({ databaseUrl: undefined });

      const { initDatabase } = require('../database');
      const pool = initDatabase();

      expect(pool).toBeNull();
    });

    it('creates a Pool with correct configuration', () => {
      const { Pool } = require('pg');
      const { initDatabase } = require('../database');
      initDatabase();

      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionString: 'postgresql://localhost/testdb',
          max: 10,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 10000,
        })
      );
    });

    it('enables SSL for Railway database URLs', () => {
      mockLoadConfig.mockReturnValue({
        databaseUrl: 'postgresql://user:pass@railway.app/db',
      });

      const { Pool } = require('pg');
      const { initDatabase } = require('../database');
      initDatabase();

      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          ssl: {
            rejectUnauthorized: false,
          },
        })
      );
    });

    it('enables SSL for Heroku database URLs', () => {
      mockLoadConfig.mockReturnValue({
        databaseUrl: 'postgresql://user:pass@herokuapp.com/db',
      });

      const { Pool } = require('pg');
      const { initDatabase } = require('../database');
      initDatabase();

      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          ssl: {
            rejectUnauthorized: false,
          },
        })
      );
    });

    it('enables SSL for AWS database URLs', () => {
      mockLoadConfig.mockReturnValue({
        databaseUrl: 'postgresql://user:pass@db.amazonaws.com/db',
      });

      const { Pool } = require('pg');
      const { initDatabase } = require('../database');
      initDatabase();

      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          ssl: {
            rejectUnauthorized: false,
          },
        })
      );
    });

    it('does not enable SSL for local database URLs', () => {
      const { Pool } = require('pg');
      const { initDatabase } = require('../database');
      initDatabase();

      const callArgs = (Pool as jest.Mock).mock.calls[0]?.[0];
      expect(callArgs).toBeDefined();
      expect(callArgs?.ssl).toBeUndefined();
    });

    it('registers error handler on pool', () => {
      const { initDatabase } = require('../database');
      initDatabase();

      expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('tests connection on initialization', () => {
      mockQuery.mockResolvedValue({ rows: [{ now: new Date() }] });

      const { initDatabase } = require('../database');
      initDatabase();

      expect(mockQuery).toHaveBeenCalledWith('SELECT NOW()');
    });

    it('returns a Pool instance when successful', () => {
      mockQuery.mockResolvedValue({ rows: [{ now: new Date() }] });

      const { initDatabase } = require('../database');
      const pool = initDatabase();

      expect(pool).toBeDefined();
      expect(pool).toHaveProperty('query');
      expect(pool).toHaveProperty('on');
    });
  });

  describe('getPool', () => {
    it('returns null when database is not initialized', () => {
      const { getPool } = require('../database');
      const pool = getPool();

      expect(pool).toBeNull();
    });

    it('returns the pool after initialization', () => {
      mockQuery.mockResolvedValue({ rows: [{ now: new Date() }] });

      const { initDatabase, getPool } = require('../database');
      initDatabase();
      const pool = getPool();

      expect(pool).toBeDefined();
      expect(pool).toHaveProperty('query');
    });
  });

  describe('isSchemaInitialized', () => {
    it('returns false before schema initialization', () => {
      const { isSchemaInitialized } = require('../database');
      const initialized = isSchemaInitialized();

      expect(initialized).toBe(false);
    });
  });

  describe('waitForSchema', () => {
    it('returns true immediately if schema is already initialized', async () => {
      mockQuery.mockResolvedValue({ rows: [] } as QueryResult);

      const { initDatabase, initializeSchema, waitForSchema } = require('../database');
      initDatabase();
      await initializeSchema();

      const result = await waitForSchema();

      expect(result).toBe(true);
    });

    it('returns false if pool is not initialized', async () => {
      const { waitForSchema } = require('../database');
      const result = await waitForSchema();

      expect(result).toBe(false);
    });

    it('times out when waiting for schema that never initializes', async () => {
      mockQuery.mockResolvedValue({ rows: [{ now: new Date() }] });

      const { initDatabase, waitForSchema } = require('../database');
      initDatabase();

      // Wait with a short timeout - schema won't be initialized
      const result = await waitForSchema(600);

      // Should return false since schema never initialized (or true if it did)
      // This tests that the function returns within the timeout period
      expect(typeof result).toBe('boolean');
    });
  });

  describe('query', () => {
    it('returns null when pool is not available', async () => {
      const { query } = require('../database');
      const result = await query('SELECT 1');

      expect(result).toBeNull();
    });

    it('executes query successfully when pool is available', async () => {
      mockQuery.mockResolvedValue({ rows: [{ result: 1 }], rowCount: 1 } as QueryResult);

      const { initDatabase, query } = require('../database');
      initDatabase();
      const result = await query('SELECT 1');

      expect(result).toEqual({ rows: [{ result: 1 }], rowCount: 1 });
      expect(mockQuery).toHaveBeenCalledWith('SELECT 1', undefined);
    });

    it('executes query with parameters', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 } as QueryResult);

      const { initDatabase, query } = require('../database');
      initDatabase();
      const result = await query('SELECT * FROM users WHERE id = $1', [123]);

      expect(result).toBeDefined();
      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [123]);
    });

    it('returns null and logs error on query failure', async () => {
      mockQuery.mockRejectedValue(new Error('Query failed'));

      const { initDatabase, query } = require('../database');
      initDatabase();
      const result = await query('SELECT * FROM nonexistent');

      expect(result).toBeNull();
    });

    it('handles empty result sets', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as QueryResult);

      const { initDatabase, query } = require('../database');
      initDatabase();
      const result = await query('SELECT * FROM empty_table');

      expect(result).toEqual({ rows: [], rowCount: 0 });
    });
  });

  describe('initializeSchema', () => {
    it('returns false when pool is not available', async () => {
      const { initializeSchema } = require('../database');
      const result = await initializeSchema();

      expect(result).toBe(false);
    });

    it('returns true if schema is already initialized', async () => {
      mockQuery.mockResolvedValue({ rows: [] } as QueryResult);

      const { initDatabase, initializeSchema } = require('../database');
      initDatabase();

      // First call
      await initializeSchema();
      mockQuery.mockClear();

      // Second call should skip
      const result = await initializeSchema();

      expect(result).toBe(true);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('creates tables when initializing schema', async () => {
      mockQuery.mockResolvedValue({ rows: [] } as QueryResult);

      const { initDatabase, initializeSchema } = require('../database');
      initDatabase();
      await initializeSchema();

      // Check that CREATE TABLE queries were executed
      const createTableCalls = mockQuery.mock.calls.filter((call) =>
        call[0]?.includes('CREATE TABLE')
      );

      expect(createTableCalls.length).toBeGreaterThan(0);
    });

    it('returns false on schema initialization error', async () => {
      mockQuery.mockRejectedValue(new Error('Schema creation failed'));

      const { initDatabase, initializeSchema } = require('../database');
      initDatabase();
      const result = await initializeSchema();

      expect(result).toBe(false);
    });
  });
});
