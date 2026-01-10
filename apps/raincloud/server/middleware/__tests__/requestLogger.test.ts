import type { Request, Response, NextFunction } from 'express';
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { spy } from 'https://deno.land/std@0.224.0/testing/mock.ts';

// ---- mock logger -------------------------------------------------

const mockLogger = {
  debug: spy(),
  http: spy(),
  warn: spy(),
  error: spy(),
  info: spy(),
};

// Mock the logger module
jest.mock('../../../utils/logger.ts', () => ({
  createLogger: jest.fn(() => mockLogger),
}));

// ---- import middleware AFTER mocking ----------------------------

import requestLogger from '../requestLogger.ts';

// ---- helpers ----------------------------------------------------

function createMockReq(): Partial<Request> {
  return {
    method: 'GET',
    originalUrl: '/api/test',
    ip: '127.0.0.1',
    get: (header: string) => (header === 'user-agent' ? 'Mozilla/5.0' : undefined),
  };
}

function createMockRes(
  listeners: Record<string, ((...args: unknown[]) => void)[]>
): Partial<Response> {
  return {
    statusCode: 200,
    on(event: string, listener: (...args: unknown[]) => void) {
      listeners[event] ??= [];
      listeners[event].push(listener);
      return this as Response;
    },
    get(header: string) {
      return header === 'content-length' ? '1234' : undefined;
    },
  };
}

function triggerFinish(listeners: Record<string, ((...args: unknown[]) => void)[]>) {
  listeners['finish']?.forEach((fn) => fn());
}

// ---- tests ------------------------------------------------------

Deno.test('calls next() to continue the request chain', () => {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const req = createMockReq();
  const res = createMockRes(listeners);
  let nextCalled = 0;

  const next: NextFunction = () => {
    nextCalled++;
  };

  requestLogger(req as Request, res as Response, next);
  assertEquals(nextCalled, 1);
});

Deno.test('registers a finish event listener on response', () => {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const req = createMockReq();
  const res = createMockRes(listeners);

  requestLogger(req as Request, res as Response, (() => {}) as NextFunction);

  assert('finish' in listeners);
});

Deno.test('logs successful requests (2xx) as http', () => {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const req = createMockReq();
  const res = createMockRes(listeners);

  requestLogger(req as Request, res as Response, (() => {}) as NextFunction);
  triggerFinish(listeners);

  assert(mockLogger.http.calls.length > 0);
});

Deno.test('logs client errors (4xx) as warn with metadata', () => {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const req = createMockReq();
  const res = createMockRes(listeners);
  res.statusCode = 404;

  requestLogger(req as Request, res as Response, (() => {}) as NextFunction);
  triggerFinish(listeners);

  assert(mockLogger.warn.calls.length > 0);
});

Deno.test('logs server errors (5xx) as error with metadata', () => {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const req = createMockReq();
  const res = createMockRes(listeners);
  res.statusCode = 500;

  requestLogger(req as Request, res as Response, (() => {}) as NextFunction);
  triggerFinish(listeners);

  const call = mockLogger.error.calls[0];
  assert(call);
  assertEquals(call.args[1].ip, '127.0.0.1');
  assertEquals(call.args[1].userAgent, 'Mozilla/5.0');
});

Deno.test('includes response duration in log', () => {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const req = createMockReq();
  const res = createMockRes(listeners);

  requestLogger(req as Request, res as Response, (() => {}) as NextFunction);
  triggerFinish(listeners);

  const message = mockLogger.http.calls[0].args[0] as string;
  assert(/\d+ms/.test(message));
});

Deno.test('includes content length in log', () => {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const req = createMockReq();
  const res = createMockRes(listeners);

  requestLogger(req as Request, res as Response, (() => {}) as NextFunction);
  triggerFinish(listeners);

  const message = mockLogger.http.calls[0].args[0] as string;
  assert(message.includes('1234b'));
});

Deno.test('handles missing content-length header', () => {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const req = createMockReq();
  const res = createMockRes(listeners);
  res.get = () => undefined;

  requestLogger(req as Request, res as Response, (() => {}) as NextFunction);
  triggerFinish(listeners);

  const message = mockLogger.http.calls[0].args[0] as string;
  assert(message.includes('-b'));
});

Deno.test('handles missing user-agent header', () => {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const req = createMockReq();
  req.get = () => undefined;

  const res = createMockRes(listeners);
  res.statusCode = 500;

  requestLogger(req as Request, res as Response, (() => {}) as NextFunction);
  triggerFinish(listeners);

  const meta = mockLogger.error.calls[0].args[1];
  assertEquals(meta.userAgent, '-');
});

Deno.test('logs different HTTP methods correctly', () => {
  const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

  for (const method of methods) {
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    const req = createMockReq();
    req.method = method;

    const res = createMockRes(listeners);

    requestLogger(req as Request, res as Response, (() => {}) as NextFunction);
    triggerFinish(listeners);

    const message = mockLogger.http.calls.at(-1)?.args[0] as string;
    assert(message.includes(method));
  }
});

Deno.test('logs incoming request at debug level', () => {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const req = createMockReq();
  const res = createMockRes(listeners);

  requestLogger(req as Request, res as Response, (() => {}) as NextFunction);

  const message = mockLogger.debug.calls[0].args[0] as string;
  assert(/GET.*\/api\/test.*127\.0\.0\.1/.test(message));
});
