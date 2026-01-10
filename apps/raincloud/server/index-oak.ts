import { Application, Context, Next } from 'https://deno.land/x/oak@v12.6.1/mod.ts';
import { Session } from 'https://deno.land/x/oak_sessions@v4.1.9/mod.ts';
import { createLogger } from '../utils/logger.ts';
import type { Client } from 'npm:discord.js@14.15.3';
import type { AppConfig } from '../types/server.ts';

const log = createLogger('SERVER');

// Extended Context for our app
export interface RainbotContext extends Context {
  user?: {
    id: string;
    username: string;
    discriminator: string;
  };
  guildMember?: any; // Discord.js GuildMember
}

export async function createServer(): Promise<Application> {
  const app = new Application();

  // Healthcheck endpoint for platform
  app.use(async (ctx: RainbotContext) => {
    if (ctx.request.url.pathname === '/health/live') {
      ctx.response.status = 200;
      ctx.response.type = 'text/plain';
      ctx.response.body = 'OK';
      return;
    }
  });

  const { loadConfig } = await import('../utils/config.ts');
  const config: AppConfig = loadConfig() as AppConfig;

  // Trust proxy - Oak handles this differently
  const isRailway =
    !!Deno.env.get('RAILWAY_ENVIRONMENT') || !!Deno.env.get('RAILWAY_PUBLIC_DOMAIN');
  if (isRailway || Deno.env.get('NODE_ENV') === 'production') {
    // Oak handles proxy headers automatically in most cases
    log.debug('Production/Railway environment detected');
  }

  // Request logging middleware
  app.use(async (ctx: RainbotContext, next: Next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    log.info(
      `${ctx.request.method} ${ctx.request.url.pathname} - ${ctx.response.status} - ${ms}ms`
    );
  });

  // Session configuration - simplified for now
  // TODO: Add proper session management with oak_sessions
  app.use(async (ctx: RainbotContext, next: Next) => {
    // Simple session-like behavior using a Map (not persistent)
    // In production, you'd want proper session storage
    const sessionId = ctx.request.headers.get('cookie')?.match(/session=([^;]+)/)?.[1];
    if (sessionId) {
      // TODO: Load session from store
      ctx.state.session = {}; // Placeholder
    } else {
      ctx.state.session = {};
    }
    await next();
  });
  log.info('Using simple session management');

  // Passport-like authentication middleware
  app.use(async (ctx: RainbotContext, next: Next) => {
    const session = await ctx.state.session;
    if (session && session.passport && session.passport.user) {
      ctx.user = session.passport.user;
    }
    await next();
  });

  // API routes
  const apiRouter = await import('./routes/api-oak.ts');
  app.use(apiRouter.default.routes());
  app.use(apiRouter.default.allowedMethods());

  // Auth routes
  const authRouter = await import('./routes/auth-oak.ts');
  app.use(authRouter.default.routes());
  app.use(authRouter.default.allowedMethods());

  // Stats routes
  const statsRouter = await import('./routes/stats-oak.ts');
  app.use(statsRouter.default.routes());
  app.use(statsRouter.default.allowedMethods());

  return app;
}
