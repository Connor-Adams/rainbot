import { createLogger } from '../utils/logger.ts';
import { loadConfig } from '../utils/config.ts';
import type { AppConfig } from '../types/server.ts';
import type { Client } from 'npm:discord.js@14.15.3';
import { authRoutes } from './routes/auth-http.ts';
import { apiRoutes, requireAuth as apiRequireAuth, requireGuildMember } from './routes/api-http.ts';
import { statsRoutes, requireAuth as statsRequireAuth } from './routes/stats-http.ts';
import { join } from '@std/path';
import { existsSync } from 'https://deno.land/std@0.224.0/fs/mod.ts';

const log = createLogger('HTTP_SERVER');

// Rate limiting store
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class RateLimiter {
  private requests = new Map<string, RateLimitEntry>();

  constructor(
    private windowMs: number,
    private maxRequests: number
  ) {}

  isAllowed(key: string): boolean {
    const now = Date.now();
    const entry = this.requests.get(key);

    if (!entry || now > entry.resetTime) {
      this.requests.set(key, { count: 1, resetTime: now + this.windowMs });
      return true;
    }

    if (entry.count >= this.maxRequests) {
      return false;
    }

    entry.count++;
    return true;
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.requests.entries()) {
      if (now > entry.resetTime) {
        this.requests.delete(key);
      }
    }
  }
}

// Session store interface
interface SessionStore {
  get(sessionId: string): Promise<any | null>;
  set(sessionId: string, data: any, ttl?: number): Promise<void>;
  destroy(sessionId: string): Promise<void>;
}

// Simple memory session store (for development)
class MemorySessionStore implements SessionStore {
  private sessions = new Map<string, { data: any; expires: number }>();

  async get(sessionId: string): Promise<any | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    if (Date.now() > session.expires) {
      this.sessions.delete(sessionId);
      return null;
    }

    return session.data;
  }

  async set(sessionId: string, data: any, ttl = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    this.sessions.set(sessionId, {
      data,
      expires: Date.now() + ttl,
    });
  }

  async destroy(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }
}

// Redis session store (if available)
class RedisSessionStore implements SessionStore {
  constructor(private redisClient: any) {}

  async get(sessionId: string): Promise<any | null> {
    try {
      const data = await this.redisClient.get(`rainbot:sess:${sessionId}`);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  async set(sessionId: string, data: any, ttl = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    try {
      await this.redisClient.setEx(
        `rainbot:sess:${sessionId}`,
        Math.floor(ttl / 1000),
        JSON.stringify(data)
      );
    } catch (error) {
      log.error('Redis session set error:', error as Record<string, unknown>);
    }
  }

  async destroy(sessionId: string): Promise<void> {
    try {
      await this.redisClient.del(`rainbot:sess:${sessionId}`);
    } catch (error) {
      log.error('Redis session destroy error:', error as Record<string, unknown>);
    }
  }
}

// Request context
export interface RainbotRequest {
  url: URL;
  method: string;
  headers: Headers;
  body?: any;
  params: Record<string, string>;
  query: URLSearchParams;
  session?: any;
  user?: any;
  ip: string;
  sessionStore?: SessionStore;
}

export interface RainbotResponse {
  status: number;
  headers: Headers;
  body?: any;
  redirect?: string;
}

// Route handler type
export type RouteHandler = (req: RainbotRequest, res: RainbotResponse) => Promise<void> | void;

// Router class
class Router {
  private routes: Array<{
    method: string;
    pattern: RegExp;
    paramNames: string[];
    handler: RouteHandler;
    middleware: RouteHandler[];
  }> = [];

  private middleware: RouteHandler[] = [];

  use(handler: RouteHandler): void {
    this.middleware.push(handler);
  }

  add(method: string, path: string, ...handlers: RouteHandler[]): void {
    const paramNames: string[] = [];
    const pattern = new RegExp(
      '^' +
        path.replace(/:([^/]+)/g, (_, param) => {
          paramNames.push(param);
          return '([^/]+)';
        }) +
        '$'
    );

    this.routes.push({
      method: method.toUpperCase(),
      pattern,
      paramNames,
      handler: handlers[handlers.length - 1],
      middleware: handlers.slice(0, -1),
    });
  }

  get(path: string, ...handlers: RouteHandler[]): void {
    this.add('GET', path, ...handlers);
  }

  post(path: string, ...handlers: RouteHandler[]): void {
    this.add('POST', path, ...handlers);
  }

  put(path: string, ...handlers: RouteHandler[]): void {
    this.add('PUT', path, ...handlers);
  }

  delete(path: string, ...handlers: RouteHandler[]): void {
    this.add('DELETE', path, ...handlers);
  }

  async handle(req: RainbotRequest, res: RainbotResponse): Promise<boolean> {
    for (const route of this.routes) {
      if (route.method !== req.method) continue;

      const match = req.url.pathname.match(route.pattern);
      if (!match) continue;

      // Extract params
      req.params = {};
      route.paramNames.forEach((name, index) => {
        req.params[name] = match[index + 1];
      });

      // Run global middleware
      for (const mw of this.middleware) {
        await mw(req, res);
        if (res.status !== 200) return true; // Response handled
      }

      // Run route middleware
      for (const mw of route.middleware) {
        await mw(req, res);
        if (res.status !== 200) return true; // Response handled
      }

      // Run handler
      await route.handler(req, res);
      return true;
    }

    return false; // No route matched
  }
}

// Main HTTP server class
export class RainbotHTTPServer {
  private router = new Router();
  private sessionStore: SessionStore;
  private rateLimiter = new RateLimiter(15 * 60 * 1000, 100); // 15 min, 100 requests
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
    this.sessionStore = new MemorySessionStore(); // Default to memory store

    this.setupRoutes();
    this.setupRedisStore();
  }

  private async setupRedisStore(): Promise<void> {
    try {
      const redis = await import('npm:redis@4.6.13');
      let redisUrl = this.config.redisUrl || Deno.env.get('REDIS_URL');

      if (!redisUrl && Deno.env.get('REDISHOST')) {
        const redisHost = Deno.env.get('REDISHOST');
        const redisPort = Deno.env.get('REDISPORT') || '6379';
        const redisPassword = Deno.env.get('REDISPASSWORD') || '';

        redisUrl = redisPassword
          ? `redis://:${redisPassword}@${redisHost}:${redisPort}`
          : `redis://${redisHost}:${redisPort}`;
      }

      if (redisUrl) {
        const redisClient = redis.createClient({ url: redisUrl });
        await redisClient.connect();
        this.sessionStore = new RedisSessionStore(redisClient);
        log.info('✓ Using Redis for session storage');
      }
    } catch (_error) {
      log.warn('Redis not available, using memory store for sessions');
    }
  }

  private setupRoutes(): void {
    // Health check
    this.router.get('/health/live', async (req, res) => {
      res.status = 200;
      res.headers.set('Content-Type', 'text/plain');
      res.body = 'OK';
    });

    // Auth routes
    this.router.get('/auth/discord', authRoutes.discord);
    this.router.get('/auth/discord/callback', authRoutes.discordCallback);
    this.router.get('/auth/check', authRoutes.check);
    this.router.post('/auth/logout', authRoutes.logout);

    // API routes
    this.router.get('/api/voice/status/:guildId', apiRequireAuth, apiRoutes.getVoiceStatus);
    this.router.post('/api/voice/join', apiRequireAuth, requireGuildMember, apiRoutes.joinVoice);
    this.router.post('/api/voice/leave', apiRequireAuth, apiRoutes.leaveVoice);
    this.router.get('/api/voice/queue/:guildId', apiRequireAuth, apiRoutes.getQueue);
    this.router.post('/api/voice/play', apiRequireAuth, requireGuildMember, apiRoutes.playTrack);
    this.router.post('/api/voice/pause', apiRequireAuth, apiRoutes.pausePlayback);
    this.router.post('/api/voice/resume', apiRequireAuth, apiRoutes.resumePlayback);
    this.router.post('/api/voice/skip', apiRequireAuth, apiRoutes.skipTrack);
    this.router.post('/api/voice/stop', apiRequireAuth, apiRoutes.stopPlayback);
    this.router.get('/api/voice/soundboard/:guildId', apiRequireAuth, apiRoutes.getSoundboard);
    this.router.post('/api/voice/soundboard/play', apiRequireAuth, apiRoutes.playSoundboardSound);
    this.router.get('/api/guilds', apiRequireAuth, apiRoutes.getGuilds);
    this.router.get('/api/guilds/:guildId/channels', apiRequireAuth, apiRoutes.getGuildChannels);

    // Stats routes
    this.router.get('/api/stats', statsRequireAuth, statsRoutes.getStats);
    this.router.get('/api/stats/guilds/:guildId', statsRequireAuth, statsRoutes.getGuildStats);
    this.router.get('/api/stats/tracks/top', statsRequireAuth, statsRoutes.getTopTracks);
    this.router.get('/api/stats/users/top', statsRequireAuth, statsRoutes.getTopUsers);
    this.router.get('/api/stats/commands/top', statsRequireAuth, statsRoutes.getTopCommands);

    // Static file serving and SPA fallback
    this.setupStaticServing();
  }

  private setupStaticServing(): void {
    // Serve React build from ui/dist (production)
    const reactBuildPath = join(Deno.cwd(), 'ui', 'dist');

    if (existsSync(reactBuildPath)) {
      // For static files, we'll handle them in the main request handler
      // since Deno.serve doesn't have built-in static file serving
      log.info('Static file serving configured for ui/dist');
    } else {
      log.warn('React build not found at ui/dist. Run "npm run build:ui" to build the UI.');
    }
  }

  private async parseBody(req: Request): Promise<any> {
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      return await req.json();
    }

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      const data: Record<string, any> = {};
      for (const [key, value] of formData.entries()) {
        data[key] = value;
      }
      return data;
    }

    if (contentType.includes('multipart/form-data')) {
      return await req.formData();
    }

    return null;
  }

  private getClientIP(req: Request): string {
    return req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1';
  }

  private async handleSession(req: RainbotRequest, _res: RainbotResponse): Promise<void> {
    // Simple session handling - in a real app you'd want more security
    const sessionId = req.headers.get('cookie')?.match(/rainbot\.sid=([^;]+)/)?.[1];

    if (sessionId) {
      req.session = await this.sessionStore.get(sessionId);
    }

    if (!req.session) {
      req.session = {};
    }

    // Set user from session
    req.user = req.session.user;
  }

  private async handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const ip = this.getClientIP(req);

    // Rate limiting
    if (!this.rateLimiter.isAllowed(ip)) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const rainbotReq: RainbotRequest = {
      url,
      method: req.method,
      headers: req.headers,
      params: {},
      query: url.searchParams,
      ip,
    };

    const rainbotRes: RainbotResponse = {
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
    };

    try {
      // Parse body
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        rainbotReq.body = await this.parseBody(req);
      }

      // Handle session
      await this.handleSession(rainbotReq, rainbotRes);

      // Route the request
      const handled = await this.router.handle(rainbotReq, rainbotRes);

      if (!handled) {
        // Try static file serving
        const staticResponse = await this.handleStaticFile(rainbotReq);
        if (staticResponse) {
          return staticResponse;
        }

        // SPA fallback - serve React app for all other routes
        const spaResponse = await this.handleSPA(rainbotReq);
        if (spaResponse) {
          return spaResponse;
        }

        rainbotRes.status = 404;
        rainbotRes.body = { error: 'Not found' };
      }

      // Handle redirects
      if (rainbotRes.redirect) {
        return Response.redirect(rainbotRes.redirect, 302);
      }

      // Convert response
      const body =
        typeof rainbotRes.body === 'string' ? rainbotRes.body : JSON.stringify(rainbotRes.body);

      return new Response(body, {
        status: rainbotRes.status,
        headers: rainbotRes.headers,
      });
    } catch (error) {
      log.error('Request error:', error as Record<string, unknown>);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  private async handleStaticFile(req: RainbotRequest): Promise<Response | null> {
    const reactBuildPath = join(Deno.cwd(), 'ui', 'dist');
    if (!existsSync(reactBuildPath)) {
      return null;
    }

    const pathname = req.url.pathname;

    // Skip API and auth routes
    if (
      pathname.startsWith('/api/') ||
      pathname.startsWith('/auth/') ||
      pathname.startsWith('/health/')
    ) {
      return null;
    }

    // Try to serve static file
    const filePath = join(reactBuildPath, pathname === '/' ? 'index.html' : pathname);

    try {
      if (existsSync(filePath)) {
        const file = await Deno.readFile(filePath);
        const contentType = this.getContentType(filePath);
        return new Response(file, {
          headers: { 'Content-Type': contentType },
        });
      }
    } catch (_error) {
      // File doesn't exist or can't be read
    }

    return null;
  }

  private async handleSPA(req: RainbotRequest): Promise<Response | null> {
    const reactBuildPath = join(Deno.cwd(), 'ui', 'dist');
    const indexPath = join(reactBuildPath, 'index.html');

    // Skip API and auth routes
    if (
      req.url.pathname.startsWith('/api/') ||
      req.url.pathname.startsWith('/auth/') ||
      req.url.pathname.startsWith('/health/')
    ) {
      return null;
    }

    if (existsSync(indexPath)) {
      try {
        const file = await Deno.readFile(indexPath);
        return new Response(file, {
          headers: { 'Content-Type': 'text/html' },
        });
      } catch (error) {
        log.error('Failed to read index.html:', error as Record<string, unknown>);
      }
    }

    return null;
  }

  private getContentType(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const contentTypes: Record<string, string> = {
      html: 'text/html',
      css: 'text/css',
      js: 'application/javascript',
      json: 'application/json',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      svg: 'image/svg+xml',
      ico: 'image/x-icon',
      woff: 'font/woff',
      woff2: 'font/woff2',
    };
    return contentTypes[ext || ''] || 'application/octet-stream';
  }

  async start(port = 3000): Promise<void> {
    const host = Deno.env.get('HOST') || '0.0.0.0';

    log.info(`Starting HTTP server on ${host}:${port}`);

    const server = Deno.serve(
      {
        hostname: host,
        port,
        onListen: ({ hostname, port }) => {
          const url = this.config.railwayPublicDomain
            ? `https://${this.config.railwayPublicDomain}`
            : `http://${hostname}:${port}`;
          log.info(`Dashboard running at ${url}`);
        },
      },
      (req) => this.handleRequest(req)
    );

    await server;
  }

  // Method to add routes programmatically
  use(_path: string, _router: Router): void {
    // This would need more implementation for sub-routers
  }
}

export async function createServer(): Promise<RainbotHTTPServer> {
  const config = loadConfig() as AppConfig;
  return new RainbotHTTPServer(config);
}

export async function start(client: Client, port = 3000): Promise<void> {
  const server = await createServer();
  // TODO: Pass client to routes that need it
  await server.start(port);
}
