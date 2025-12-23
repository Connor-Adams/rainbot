# Rainbot Architecture Documentation

## Overview

Rainbot is a Discord music bot with web dashboard, featuring:

- Multi-source music playback (YouTube, Spotify, SoundCloud)
- Soundboard with overlay capability
- Queue persistence across restarts
- Thread-safe queue operations
- REST API for web dashboard integration
- Statistics and listening history tracking

## Technology Stack

### Core

- **Runtime:** Node.js 22.12.0+
- **Language:** JavaScript (CommonJS) with TypeScript type definitions
- **Discord:** discord.js v14.25.1
- **Voice:** @discordjs/voice v0.19.0

### Dependencies

- **Audio Streaming:** play-dl, youtube-dl-exec
- **Database:** PostgreSQL (via pg)
- **Session Store:** Redis + express-session
- **Storage:** AWS S3 (via @aws-sdk/client-s3)
- **Authentication:** passport + passport-oauth2
- **Dependency Injection:** InversifyJS (in progress)

### Development

- **TypeScript:** Compiler + type checking (strict mode)
- **Linting:** ESLint with Prettier
- **Testing:** Jest with ts-jest
- **Pre-commit:** Husky + lint-staged
- **API Docs:** Swagger/OpenAPI

## Project Structure

```
rainbot/
├── commands/          # Discord slash commands
├── events/            # Discord event handlers
├── handlers/          # Command and event loaders
├── server/            # Express web server
│   ├── routes/       # API endpoints
│   ├── middleware/   # Auth, validation, etc.
│   └── swagger.ts    # OpenAPI documentation
├── types/             # TypeScript type definitions
│   ├── commands.ts
│   ├── services.ts
│   ├── common.ts
│   └── di.symbols.ts
├── utils/             # Core utilities
│   ├── voice/        # Voice manager modules (NEW)
│   ├── config.js     # Configuration loader
│   ├── database.js   # PostgreSQL client
│   ├── logger.js     # Winston logger
│   ├── statistics.js # Usage tracking
│   └── storage.js    # S3/local file storage
├── ui/                # React dashboard (separate build)
├── public/            # Static assets
└── index.js           # Entry point
```

## Code Organization Principles

### 1. Modular Architecture

Large modules are split into focused sub-modules:

**Before:**

```
utils/voiceManager.js (72KB, 2000+ lines)
```

**After:**

```
utils/voice/
├── audioResource.js    (streaming logic)
├── queueManager.js     (thread-safe queue ops)
├── soundboardManager.js (overlay mixing)
├── snapshotManager.js  (persistence)
├── trackFetcher.js     (metadata fetching)
└── constants.js        (shared config)
```

### 2. Type Safety

Gradual TypeScript adoption:

- Core types defined in `types/` directory
- JSDoc comments for JavaScript files
- Strict TypeScript config for new TS files
- Interfaces for dependency injection

### 3. Dependency Injection

Inversify container setup for:

- Logger instances
- Database connections
- Storage adapters
- Configuration providers

Benefits:

- Easier testing (mock dependencies)
- Clearer dependency graphs
- Better code organization

### 4. Thread Safety

Critical sections protected with mutexes:

- Queue modifications (async-mutex)
- Database writes (connection pooling)
- Redis operations (atomic commands)

## Voice Manager Architecture

See [`utils/voice/README.md`](utils/voice/README.md) for detailed documentation.

**Key Concepts:**

1. **Queue vs Soundboard**
   - Music tracks: Queued, play sequentially
   - Soundboard: Instant, overlay on music

2. **Thread Safety**
   - Mutex locks prevent race conditions
   - Atomic queue operations
   - Safe for concurrent API + Discord commands

3. **Persistence**
   - Queue snapshots saved to database
   - Restored on bot restart
   - Preserves playback position and pause state

4. **Multiple Fallbacks**
   - Fetch API → yt-dlp piping → play-dl
   - Ensures maximum reliability

## API Documentation

Swagger UI available at `/api-docs` when server is running.

**Endpoints:**

- `GET /api/guilds` - List user's guilds
- `GET /api/guilds/:id/queue` - Get queue for guild
- `POST /api/guilds/:id/play` - Add track to queue
- `POST /api/guilds/:id/soundboard` - Play soundboard
- `POST /api/guilds/:id/skip` - Skip track(s)
- `DELETE /api/guilds/:id/queue` - Clear queue
- More documented in Swagger spec

## Database Schema

### Key Tables

**guild_queue_snapshots**

- Stores queue state for persistence
- Upserted on shutdown, deleted on restore

**listening_history**

- User's playback history
- Track metadata and timestamps

**soundboard_files**

- Soundboard metadata
- S3 keys, upload info

**statistics**

- Usage analytics
- Aggregated in-memory, flushed periodically

## Development Workflow

### Setup

```bash
npm install
cp .env.example .env
# Configure environment variables
npm run build:ts  # Compile TypeScript
```

### Development

```bash
npm run dev:ui     # Start UI dev server
npm run start      # Start bot
```

### Code Quality

```bash
npm run lint       # Check linting
npm run lint:fix   # Auto-fix issues
npm run format     # Format with Prettier
npm run type-check # TypeScript validation
npm test           # Run tests
npm run validate   # Run all checks
```

### Pre-commit Hooks

Automatically runs on `git commit`:

- ESLint on changed files
- Prettier formatting
- TypeScript type checking

## Deployment

### Railway (Production)

See [`RAILWAY_DEPLOY.md`](RAILWAY_DEPLOY.md) for detailed setup.

**Requirements:**

- PostgreSQL database
- Redis instance
- S3-compatible storage (AWS S3 or Backblaze B2)
- Environment variables configured

**Build:**

```bash
npm run build      # Builds UI + compiles TS
npm start          # Production start
```

## Testing Strategy

### Unit Tests

- Individual module functions
- Mock external dependencies
- Focus on business logic

### Integration Tests

- API endpoint testing
- Database operations
- Voice state management

### Test Organization

```
__tests__/
├── unit/
│   ├── voice/
│   │   ├── queueManager.test.js
│   │   └── audioResource.test.js
│   └── utils/
│       └── statistics.test.js
└── integration/
    ├── api/
    └── database/
```

## Contributing Guidelines

### Code Style

- Use Prettier for formatting (config in `.prettierrc.json`)
- Follow ESLint rules (config in `eslint.config.js`)
- Write JSDoc comments for functions
- Add TypeScript types where possible

### Module Guidelines

- Keep files under 500 lines
- Single responsibility principle
- Export only what's needed
- Document public APIs

### Commit Messages

```
feat: Add new feature
fix: Fix bug
refactor: Code restructuring
docs: Documentation updates
test: Add tests
chore: Maintenance tasks
```

### Pull Requests

1. Create feature branch from `main`
2. Make changes with clear commits
3. Ensure all tests pass
4. Update documentation
5. Request review

## Performance Considerations

### Caching

- Stream URLs cached (2hr expiration)
- LRU eviction at 500 entries
- In-memory statistics with periodic flush

### Concurrency

- Mutex locks for queue operations
- Connection pooling for database
- Redis for session scaling

### Resource Management

- FFmpeg processes killed on cleanup
- Subprocess error handling
- Graceful shutdown hooks

## Security

### Authentication

- Discord OAuth2 for web dashboard
- Session-based auth with Redis
- CSRF protection (in progress)

### Input Validation

- URL parsing and sanitization
- File upload restrictions
- Rate limiting (planned)

### Data Protection

- Environment variables for secrets
- Database credentials via config
- S3 signed URLs for uploads

## Future Enhancements

### Planned Features

- [ ] Complete DI container integration
- [ ] Comprehensive test coverage (>80%)
- [ ] Rate limiting for API
- [ ] WebSocket for real-time updates
- [ ] User preferences/settings
- [ ] Playlist management
- [ ] Advanced queue controls (shuffle, repeat)

### Technical Debt

- [ ] Convert more JS files to TypeScript
- [ ] Add error boundaries
- [ ] Implement retry strategies
- [ ] Database migration system
- [ ] Monitoring and alerting

## Resources

- [Discord.js Guide](https://discordjs.guide/)
- [Discord Voice Guide](https://discordjs.guide/voice/)
- [Railway Docs](https://docs.railway.app/)
- [InversifyJS Docs](https://inversify.io/)
- [Jest Docs](https://jestjs.io/)
