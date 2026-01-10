/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest, DiscordUser } from '../../../types/server';
import { requireAuth } from '../auth';
import { assertEquals, assert, assertThrows, assertRejects } from '@std/assert';

// Mock implementations for testing
const mockConfig = {
  requiredRoleId: 'test-role-id',
};

// Mock the config module
const originalConfig = await import('../../../utils/config');
const mockLoadConfig = () => mockConfig;

// Mock the client module
const mockClient = { id: 'bot-client' };
const originalClient = await import('../../client');
const mockGetClient = () => mockClient;

// Mock the role verifier
let mockVerifyUserRoleResult = true;
const mockVerifyUserRole = async () => mockVerifyUserRoleResult;

// Apply mocks
Object.defineProperty(await import('../../../utils/config'), 'loadConfig', {
  value: mockLoadConfig,
  writable: true,
});

Object.defineProperty(await import('../../client'), 'getClient', {
  value: mockGetClient,
  writable: true,
});

Object.defineProperty(await import('../../utils/roleVerifier'), 'verifyUserRole', {
  value: mockVerifyUserRole,
  writable: true,
});

// auth middleware tests
Deno.test('auth middleware - requireAuth returns 401 when user is not authenticated', async () => {
  const mockReq: Partial<AuthenticatedRequest> = {
    isAuthenticated: () => false,
    user: {
      id: 'user-123',
      username: 'TestUser',
      discriminator: '1234',
      avatar: 'avatar-hash',
    } as DiscordUser,
    session: {},
  };

  const mockRes: Partial<Response> = {
    status: (code: number) => ({ json: (data: any) => ({ code, data }) }) as any as any,
  };

  let nextCalled = false;
  const mockNext: NextFunction = () => {
    nextCalled = true;
  };

  await requireAuth(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

  assertEquals(nextCalled, false);
});

Deno.test(
  'auth middleware - requireAuth allows access when user is authenticated and has role',
  async () => {
    const mockReq: Partial<AuthenticatedRequest> = {
      isAuthenticated: () => true,
      user: {
        id: 'user-123',
        username: 'TestUser',
        discriminator: '1234',
        avatar: 'avatar-hash',
      } as DiscordUser,
      session: {},
    };

    const mockRes: Partial<Response> = {
      status: () => ({ json: () => {} }),
    };

    let nextCalled = false;
    const mockNext: NextFunction = () => {
      nextCalled = true;
    };

    await requireAuth(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

    assertEquals(nextCalled, true);
  }
);

Deno.test('auth middleware - requireAuth denies access when user lacks required role', async () => {
  mockVerifyUserRoleResult = false;

  const mockReq: Partial<AuthenticatedRequest> = {
    isAuthenticated: () => true,
    user: {
      id: 'user-123',
      username: 'TestUser',
      discriminator: '1234',
      avatar: 'avatar-hash',
    } as DiscordUser,
    session: {},
  };

  const mockRes: Partial<Response> = {
    status: (code: number) => ({ json: (data: any) => ({ code, data }) }) as any as any,
  };

  let nextCalled = false;
  const mockNext: NextFunction = () => {
    nextCalled = true;
  };

  await requireAuth(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

  assertEquals(nextCalled, false);
});

Deno.test('auth middleware - requireAuth allows access when no role is required', async () => {
  mockConfig.requiredRoleId = undefined;

  const mockReq: Partial<AuthenticatedRequest> = {
    isAuthenticated: () => true,
    user: {
      id: 'user-123',
      username: 'TestUser',
      discriminator: '1234',
      avatar: 'avatar-hash',
    } as DiscordUser,
    session: {},
  };

  const mockRes: Partial<Response> = {
    status: () => ({ json: () => {} }),
  };

  let nextCalled = false;
  const mockNext: NextFunction = () => {
    nextCalled = true;
  };

  await requireAuth(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

  assertEquals(nextCalled, true);
});
