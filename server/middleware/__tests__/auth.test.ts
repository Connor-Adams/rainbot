/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest, DiscordUser } from '@rainbot/types/server';

// Mock logger
jest.mock('../../../utils/logger', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    http: jest.fn(),
  }),
}));

// Mock config
const mockConfig = {
  requiredRoleId: 'test-role-id',
};

jest.mock('../../../utils/config', () => ({
  loadConfig: jest.fn(() => mockConfig),
}));

// Mock client
const mockClient = { id: 'bot-client' };

jest.mock('../../client', () => ({
  getClient: jest.fn(() => mockClient),
}));

// Mock role verifier
jest.mock('../../utils/roleVerifier', () => ({
  verifyUserRole: jest.fn(),
}));

import { requireAuth } from '../auth';
import { verifyUserRole } from '../../utils/roleVerifier';

const mockVerifyUserRole = verifyUserRole as jest.MockedFunction<typeof verifyUserRole>;

describe('auth middleware', () => {
  let mockReq: Partial<AuthenticatedRequest>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      isAuthenticated: jest.fn(() => true),
      user: {
        id: 'user-123',
        username: 'TestUser',
        discriminator: '1234',
        avatar: 'avatar-hash',
      } as DiscordUser,
      session: {
        hasAccess: undefined,
        lastVerified: undefined,
      } as any,
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    mockNext = jest.fn();

    mockConfig.requiredRoleId = 'test-role-id';
    mockVerifyUserRole.mockResolvedValue(true);
  });

  describe('requireAuth', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockReq.isAuthenticated = jest.fn(() => false);

      await requireAuth(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('returns 401 when isAuthenticated is not defined', async () => {
      mockReq.isAuthenticated = undefined;

      await requireAuth(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('returns 401 when user is undefined', async () => {
      mockReq.user = undefined;

      await requireAuth(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid session' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('returns 401 when user id is missing', async () => {
      mockReq.user = { username: 'Test' } as DiscordUser;

      await requireAuth(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid session' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('allows access when requiredRoleId is not configured', async () => {
      mockConfig.requiredRoleId = undefined;

      await requireAuth(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockVerifyUserRole).not.toHaveBeenCalled();
    });

    it('uses cached verification when valid', async () => {
      const now = Date.now();
      mockReq.session = {
        hasAccess: true,
        lastVerified: now - 60000, // 1 minute ago
      } as any;

      await requireAuth(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockVerifyUserRole).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('verifies role when cache is expired', async () => {
      const now = Date.now();
      mockReq.session = {
        hasAccess: true,
        lastVerified: now - 400000, // > 5 minutes ago
      } as any;

      await requireAuth(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockVerifyUserRole).toHaveBeenCalledWith('user-123', 'test-role-id', mockClient);
      expect(mockNext).toHaveBeenCalled();
    });

    it('verifies role when no cache exists', async () => {
      mockReq.session = {} as any;

      await requireAuth(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockVerifyUserRole).toHaveBeenCalledWith('user-123', 'test-role-id', mockClient);
      expect(mockNext).toHaveBeenCalled();
    });

    it('grants access when user has required role', async () => {
      mockVerifyUserRole.mockResolvedValueOnce(true);

      await requireAuth(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('denies access when user lacks required role', async () => {
      mockVerifyUserRole.mockResolvedValueOnce(false);

      await requireAuth(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Access denied: You do not have the required role',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('updates session cache after successful verification', async () => {
      mockVerifyUserRole.mockResolvedValueOnce(true);
      mockReq.session = {} as any;

      await requireAuth(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockReq.session?.hasAccess).toBe(true);
      expect(mockReq.session?.lastVerified).toBeGreaterThan(0);
      expect(mockNext).toHaveBeenCalled();
    });

    it('updates session cache after failed verification', async () => {
      mockVerifyUserRole.mockResolvedValueOnce(false);
      mockReq.session = {} as any;

      await requireAuth(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockReq.session?.hasAccess).toBe(false);
      expect(mockReq.session?.lastVerified).toBeGreaterThan(0);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('handles verification errors gracefully', async () => {
      mockVerifyUserRole.mockRejectedValueOnce(new Error('Verification failed'));

      await requireAuth(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Error verifying access' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('works when session is undefined', async () => {
      mockReq.session = undefined;
      mockVerifyUserRole.mockResolvedValueOnce(true);

      await requireAuth(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });
});
