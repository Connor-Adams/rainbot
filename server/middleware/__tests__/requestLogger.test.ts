import type { Request, Response, NextFunction } from 'express';
import requestLogger from '../requestLogger';
import { assertEquals, assert, assertThrows, assertRejects } from '@std/assert';

// Mock logger instance
const mockLogger = {
  debug: jest.fn(),
  http: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
};

// Mock the logger module
const originalLogger = await import('../../../utils/logger');
const mockCreateLogger = () => mockLogger;

// Apply mock
Object.defineProperty(await import('../../../utils/logger'), 'createLogger', {
  value: mockCreateLogger,
  writable: true,
});

// requestLogger middleware tests
Deno.test('requestLogger - calls next() to continue the request chain', () => {
  const mockRequest: Partial<Request> = {
    method: 'GET',
    originalUrl: '/api/test',
    ip: '127.0.0.1',
    get: () => 'Mozilla/5.0',
  };

  const mockResponse: Partial<Response> = {
    statusCode: 200,
    on: () => mockResponse as Response,
    get: () => '1234',
  };

  let nextCalled = false;
  const mockNext: NextFunction = () => {
    nextCalled = true;
  };

  requestLogger(mockRequest as Request, mockResponse as Response, mockNext);

  assertEquals(nextCalled, true);
});

Deno.test('requestLogger - registers a finish event listener on response', () => {
  const mockRequest: Partial<Request> = {
    method: 'GET',
    originalUrl: '/api/test',
    ip: '127.0.0.1',
    get: () => 'Mozilla/5.0',
  };

  let onCalled = false;
  const mockResponse: Partial<Response> = {
    statusCode: 200,
    on: () => {
      onCalled = true;
      return mockResponse as Response;
    },
    get: () => '1234',
  };

  const mockNext: NextFunction = () => {};

  requestLogger(mockRequest as Request, mockResponse as Response, mockNext);

  assertEquals(onCalled, true);
});

Deno.test('requestLogger - logs successful requests (2xx) as http level', () => {
  const mockRequest: Partial<Request> = {
    method: 'GET',
    originalUrl: '/api/test',
    ip: '127.0.0.1',
    get: () => 'Mozilla/5.0',
  };

  const listeners: ((...args: unknown[]) => void)[] = [];
  const mockResponse: Partial<Response> = {
    statusCode: 200,
    on: (event: string, listener: (...args: unknown[]) => void) => {
      if (event === 'finish') listeners.push(listener);
      return mockResponse as Response;
    },
    get: () => '1234',
  };

  const mockNext: NextFunction = () => {};

  requestLogger(mockRequest as Request, mockResponse as Response, mockNext);

  // Trigger finish event
  listeners.forEach((listener) => listener());

  // Check that http was called (we can't easily check the exact message without more complex mocking)
  assert(mockLogger.http.mock.calls.length > 0);
});

Deno.test('requestLogger - logs client errors (4xx) as warn level', () => {
  const mockRequest: Partial<Request> = {
    method: 'GET',
    originalUrl: '/api/test',
    ip: '127.0.0.1',
    get: () => 'Mozilla/5.0',
  };

  const listeners: ((...args: unknown[]) => void)[] = [];
  const mockResponse: Partial<Response> = {
    statusCode: 404,
    on: (event: string, listener: (...args: unknown[]) => void) => {
      if (event === 'finish') listeners.push(listener);
      return mockResponse as Response;
    },
    get: () => '1234',
  };

  const mockNext: NextFunction = () => {};

  requestLogger(mockRequest as Request, mockResponse as Response, mockNext);

  // Trigger finish event
  listeners.forEach((listener) => listener());

  assert(mockLogger.warn.mock.calls.length > 0);
});

Deno.test('requestLogger - logs server errors (5xx) as error level', () => {
  const mockRequest: Partial<Request> = {
    method: 'GET',
    originalUrl: '/api/test',
    ip: '127.0.0.1',
    get: () => 'Mozilla/5.0',
  };

  const listeners: ((...args: unknown[]) => void)[] = [];
  const mockResponse: Partial<Response> = {
    statusCode: 500,
    on: (event: string, listener: (...args: unknown[]) => void) => {
      if (event === 'finish') listeners.push(listener);
      return mockResponse as Response;
    },
    get: () => '1234',
  };

  const mockNext: NextFunction = () => {};

  requestLogger(mockRequest as Request, mockResponse as Response, mockNext);

  // Trigger finish event
  listeners.forEach((listener) => listener());

  assert(mockLogger.error.mock.calls.length > 0);
});

Deno.test('requestLogger - logs incoming request at debug level', () => {
  const mockRequest: Partial<Request> = {
    method: 'GET',
    originalUrl: '/api/test',
    ip: '127.0.0.1',
    get: () => 'Mozilla/5.0',
  };

  const mockResponse: Partial<Response> = {
    statusCode: 200,
    on: () => mockResponse as Response,
    get: () => '1234',
  };

  const mockNext: NextFunction = () => {};

  requestLogger(mockRequest as Request, mockResponse as Response, mockNext);

  assert(mockLogger.debug.mock.calls.length > 0);
});
