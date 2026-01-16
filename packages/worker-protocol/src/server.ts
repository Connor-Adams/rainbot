import express, { Express, Request, Response } from 'express';
import { createLogger } from '@rainbot/shared';
import type {
  BotType,
  JoinRequest,
  JoinResponse,
  LeaveRequest,
  LeaveResponse,
  VolumeRequest,
  VolumeResponse,
  StatusRequest,
  StatusResponse,
  HealthResponse,
} from './types';

const log = createLogger('WORKER-SERVER');

function logRequestError(
  action: string,
  identifiers: Record<string, string | undefined>,
  error: unknown
): void {
  const err = error instanceof Error ? error : new Error(String(error));
  const detail = Object.entries(identifiers)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
  const suffix = detail ? ` (${detail})` : '';
  log.error(`${action} failed${suffix}: ${err.message}`);
  if (err.stack) {
    log.debug(err.stack);
  }
}

/**
 * Base class for worker servers with idempotency support
 */
export abstract class WorkerServerBase {
  protected app: Express;
  private requestCache = new Map<string, unknown>();
  private startTime: number;

  constructor(protected botType: BotType) {
    this.app = express();
    this.app.use(express.json());
    this.startTime = Date.now();
    this.setupCommonRoutes();
  }

  private setupCommonRoutes(): void {
    // Join voice channel
    this.app.post('/join', async (req: Request, res: Response) => {
      const request: JoinRequest = req.body;

      if (!request.requestId || !request.guildId || !request.channelId) {
        return res.status(400).json({
          status: 'error',
          message: 'Missing required fields: requestId, guildId, channelId',
        });
      }

      // Idempotency check
      if (this.requestCache.has(request.requestId)) {
        log.debug(`Returning cached response for request ${request.requestId}`);
        return res.json(this.requestCache.get(request.requestId));
      }

      try {
        const response = await this.handleJoin(request);
        this.cacheResponse(request.requestId, response);
        res.json(response);
      } catch (error) {
        logRequestError(
          'Join request',
          { requestId: request.requestId, guildId: request.guildId },
          error
        );
        const errorResponse: JoinResponse = {
          status: 'error',
          message: (error as Error).message,
        };
        res.status(500).json(errorResponse);
      }
    });

    // Leave voice channel
    this.app.post('/leave', async (req: Request, res: Response) => {
      const request: LeaveRequest = req.body;

      if (!request.requestId || !request.guildId) {
        return res.status(400).json({
          status: 'error',
          message: 'Missing required fields: requestId, guildId',
        });
      }

      // Idempotency check
      if (this.requestCache.has(request.requestId)) {
        log.debug(`Returning cached response for request ${request.requestId}`);
        return res.json(this.requestCache.get(request.requestId));
      }

      try {
        const response = await this.handleLeave(request);
        this.cacheResponse(request.requestId, response);
        res.json(response);
      } catch (error) {
        logRequestError(
          'Leave request',
          { requestId: request.requestId, guildId: request.guildId },
          error
        );
        const errorResponse: LeaveResponse = {
          status: 'error',
          message: (error as Error).message,
        };
        res.status(500).json(errorResponse);
      }
    });

    // Set volume
    this.app.post('/volume', async (req: Request, res: Response) => {
      const request: VolumeRequest = req.body;

      if (!request.requestId || !request.guildId || request.volume === undefined) {
        return res.status(400).json({
          status: 'error',
          message: 'Missing required fields: requestId, guildId, volume',
        });
      }

      // Validate volume range
      if (request.volume < 0 || request.volume > 1) {
        return res.status(400).json({
          status: 'error',
          message: 'Volume must be between 0.0 and 1.0',
        });
      }

      // Idempotency check
      if (this.requestCache.has(request.requestId)) {
        log.debug(`Returning cached response for request ${request.requestId}`);
        return res.json(this.requestCache.get(request.requestId));
      }

      try {
        const response = await this.handleVolume(request);
        this.cacheResponse(request.requestId, response);
        res.json(response);
      } catch (error) {
        logRequestError(
          'Volume request',
          { requestId: request.requestId, guildId: request.guildId },
          error
        );
        const errorResponse: VolumeResponse = {
          status: 'error',
          message: (error as Error).message,
        };
        res.status(500).json(errorResponse);
      }
    });

    // Get status
    this.app.get('/status', async (req: Request, res: Response) => {
      const guildId = req.query['guildId'] as string;

      if (!guildId) {
        return res.status(400).json({
          error: 'Missing required query parameter: guildId',
        });
      }

      try {
        const response = await this.handleStatus({ guildId });
        res.json(response);
      } catch (error) {
        logRequestError('Status request', { guildId }, error);
        res.status(500).json({
          error: (error as Error).message,
        });
      }
    });

    // Liveness probe
    this.app.get('/health/live', (req: Request, res: Response) => {
      res.status(200).send('OK');
    });

    // Readiness probe
    this.app.get('/health/ready', (req: Request, res: Response) => {
      const response: HealthResponse = {
        status: 'ok',
        uptime: Date.now() - this.startTime,
        botType: this.botType,
        timestamp: Date.now(),
      };
      res.json(response);
    });
  }

  /**
   * Cache a response for idempotency (60 seconds TTL)
   */
  private cacheResponse(requestId: string, response: unknown): void {
    this.requestCache.set(requestId, response);
    setTimeout(() => {
      this.requestCache.delete(requestId);
      log.debug(`Removed cached response for request ${requestId}`);
    }, 60000); // 60 seconds
  }

  /**
   * Register a custom route
   */
  protected registerRoute(
    method: 'get' | 'post' | 'put' | 'delete',
    path: string,
    handler: (req: Request, res: Response) => void | Promise<void>
  ): void {
    this.app[method](path, handler);
  }

  /**
   * Start the server
   */
  start(port: number): void {
    this.app.listen(port, () => {
      log.info(`${this.botType} worker server started on port ${port}`);
    });
  }

  // Abstract methods to be implemented by subclasses
  protected abstract handleJoin(request: JoinRequest): Promise<JoinResponse>;
  protected abstract handleLeave(request: LeaveRequest): Promise<LeaveResponse>;
  protected abstract handleVolume(request: VolumeRequest): Promise<VolumeResponse>;
  protected abstract handleStatus(request: StatusRequest): Promise<StatusResponse>;
}
