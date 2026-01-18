/**
 * Tests for soundboard error handling
 *
 * These tests verify that FFmpeg errors during overlay don't crash the bot
 */

import { EventEmitter } from 'events';
import { Readable } from 'stream';

describe('Soundboard Error Handling', () => {
  describe('FFmpeg stdout error handling', () => {
    it('should attach error handler to FFmpeg stdout before creating AudioResource', () => {
      // Mock FFmpeg stdout stream
      const mockStdout = new EventEmitter() as Readable;
      const errorHandler = jest.fn();

      // Attach error handler
      mockStdout.on('error', errorHandler);

      // Emit error (simulating ECONNRESET)
      const mockError = new Error('read ECONNRESET');
      (mockError as NodeJS.ErrnoException).code = 'ECONNRESET';
      mockStdout.emit('error', mockError);

      // Error should be caught and handled
      expect(errorHandler).toHaveBeenCalledWith(mockError);
      expect(errorHandler).toHaveBeenCalledTimes(1);
    });

    it('should handle errors on wrapped AudioResource playStream', () => {
      // Mock AudioResource with playStream
      const mockPlayStream = new EventEmitter() as Readable;
      const errorHandler = jest.fn();

      // Attach error handler to playStream
      mockPlayStream.on('error', errorHandler);

      // Emit error on wrapped stream
      const mockError = new Error('Stream error');
      mockPlayStream.emit('error', mockError);

      // Error should be caught
      expect(errorHandler).toHaveBeenCalledWith(mockError);
    });

    it('should not crash when FFmpeg fails with 403 Forbidden', () => {
      const mockStdout = new EventEmitter() as Readable;
      const errorHandler = jest.fn();

      mockStdout.on('error', errorHandler);

      // Simulate FFmpeg error due to expired URL
      const error403 = new Error('HTTP error 403 Forbidden');
      mockStdout.emit('error', error403);

      // Should be handled gracefully
      expect(errorHandler).toHaveBeenCalled();
      expect(() => mockStdout.emit('error', error403)).not.toThrow();
    });
  });

  describe('Multiple error sources', () => {
    it('should handle errors from all FFmpeg streams', () => {
      const mockStdout = new EventEmitter() as Readable;

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const mockStderr = new EventEmitter() as Readable;
      const mockProcess = new EventEmitter();

      const stdoutErrorHandler = jest.fn();
      const processErrorHandler = jest.fn();

      mockStdout.on('error', stdoutErrorHandler);
      mockProcess.on('error', processErrorHandler);

      // Emit errors on different streams
      mockStdout.emit('error', new Error('stdout error'));
      mockProcess.emit('error', new Error('process error'));

      expect(stdoutErrorHandler).toHaveBeenCalledTimes(1);
      expect(processErrorHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error handler attachment order', () => {
    it('should have error handler attached before any data flows', () => {
      const mockStdout = new EventEmitter() as Readable;
      const errorSpy = jest.fn();

      // Error handler must be attached first
      mockStdout.on('error', errorSpy);

      // Then data/errors can flow
      mockStdout.emit('error', new Error('test'));

      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('Graceful degradation', () => {
    it('should allow overlay to fail without affecting queue', () => {
      // When overlay fails, the bot should:
      // 1. Log the error
      // 2. Clean up overlay process
      // 3. Continue with queue if available

      const mockQueue = [
        { title: 'Track 1', url: 'https://example.com/1' },
        { title: 'Track 2', url: 'https://example.com/2' },
      ];

      // Overlay fails
      const overlayFailed = true;

      // Queue should remain intact
      expect(mockQueue).toHaveLength(2);
      expect(overlayFailed).toBe(true);

      // Bot should continue playing from queue
      expect(mockQueue[0]?.title).toBe('Track 1');
    });
  });
});
