import type { Request, Response, NextFunction } from 'express';

// Mock logger instance - must be defined before the mock
const mockLogger = {
  debug: jest.fn(),
  http: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
};

// Mock the logger
jest.mock('../../../utils/logger', () => ({
  createLogger: jest.fn(() => mockLogger),
}));

import requestLogger from '../requestLogger';

describe('requestLogger middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let responseListeners: Record<string, ((...args: unknown[]) => void)[]>;

  beforeEach(() => {
    jest.clearAllMocks();
    responseListeners = {};

    mockRequest = {
      method: 'GET',
      originalUrl: '/api/test',
      ip: '127.0.0.1',
      get: jest.fn((header: string) => {
        if (header === 'user-agent') return 'Mozilla/5.0';
        return undefined;
      }),
    };

    mockResponse = {
      statusCode: 200,
      on: jest.fn((event: string, listener: (...args: unknown[]) => void) => {
        if (!responseListeners[event]) {
          responseListeners[event] = [];
        }
        responseListeners[event]?.push(listener);
        return mockResponse as Response;
      }),
      get: jest.fn((header: string) => {
        if (header === 'content-length') return '1234';
        return undefined;
      }),
    };

    mockNext = jest.fn();
  });

  it('calls next() to continue the request chain', () => {
    requestLogger(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  it('registers a finish event listener on response', () => {
    requestLogger(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockResponse.on).toHaveBeenCalledWith('finish', expect.any(Function));
  });

  it('logs successful requests (2xx) as http level', () => {
    mockResponse.statusCode = 200;
    requestLogger(mockRequest as Request, mockResponse as Response, mockNext);

    // Trigger finish event
    const finishListeners = responseListeners['finish'];
    finishListeners?.forEach((listener) => listener());

    expect(mockLogger.http).toHaveBeenCalledWith(expect.stringContaining('GET /api/test 200'));
  });

  it('logs client errors (4xx) as warn level', () => {
    mockResponse.statusCode = 404;
    requestLogger(mockRequest as Request, mockResponse as Response, mockNext);

    // Trigger finish event
    const finishListeners = responseListeners['finish'];
    finishListeners?.forEach((listener) => listener());

    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('GET /api/test 404'));
  });

  it('logs server errors (5xx) as error level', () => {
    mockResponse.statusCode = 500;
    requestLogger(mockRequest as Request, mockResponse as Response, mockNext);

    // Trigger finish event
    const finishListeners = responseListeners['finish'];
    finishListeners?.forEach((listener) => listener());

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('GET /api/test 500'),
      expect.objectContaining({
        ip: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
      })
    );
  });

  it('includes response duration in log', () => {
    requestLogger(mockRequest as Request, mockResponse as Response, mockNext);

    // Trigger finish event
    const finishListeners = responseListeners['finish'];
    finishListeners?.forEach((listener) => listener());

    expect(mockLogger.http).toHaveBeenCalledWith(expect.stringMatching(/\d+ms/));
  });

  it('includes content length in log', () => {
    requestLogger(mockRequest as Request, mockResponse as Response, mockNext);

    // Trigger finish event
    const finishListeners = responseListeners['finish'];
    finishListeners?.forEach((listener) => listener());

    expect(mockLogger.http).toHaveBeenCalledWith(expect.stringContaining('1234b'));
  });

  it('handles missing content-length header', () => {
    mockResponse.get = jest.fn(() => undefined);

    requestLogger(mockRequest as Request, mockResponse as Response, mockNext);

    // Trigger finish event
    const finishListeners = responseListeners['finish'];
    finishListeners?.forEach((listener) => listener());

    expect(mockLogger.http).toHaveBeenCalledWith(expect.stringContaining('-b'));
  });

  it('handles missing user-agent header', () => {
    mockRequest.get = jest.fn(() => undefined);
    mockResponse.statusCode = 500;

    requestLogger(mockRequest as Request, mockResponse as Response, mockNext);

    // Trigger finish event
    const finishListeners = responseListeners['finish'];
    finishListeners?.forEach((listener) => listener());

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        userAgent: '-',
      })
    );
  });

  it('logs different HTTP methods correctly', () => {
    const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

    methods.forEach((method) => {
      mockLogger.http.mockClear();
      mockRequest.method = method;
      requestLogger(mockRequest as Request, mockResponse as Response, mockNext);

      // Trigger finish event
      const finishListeners = responseListeners['finish'];
      finishListeners?.forEach((listener) => listener());

      expect(mockLogger.http).toHaveBeenCalledWith(expect.stringContaining(method));
    });
  });

  it('logs the original URL correctly', () => {
    mockRequest.originalUrl = '/api/v1/users/123?param=value';

    requestLogger(mockRequest as Request, mockResponse as Response, mockNext);

    // Trigger finish event
    const finishListeners = responseListeners['finish'];
    finishListeners?.forEach((listener) => listener());

    expect(mockLogger.http).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/users/123?param=value')
    );
  });

  it('logs incoming request at debug level', () => {
    requestLogger(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.stringMatching(/→.*GET.*\/api\/test.*127\.0\.0\.1/)
    );
  });
});
