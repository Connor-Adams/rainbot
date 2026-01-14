# Testing Strategy & Coverage Plan

## Current Status (January 2026)

### Coverage Summary

- **Statements**: 18.05% (665/3684)
- **Branches**: 12.31% (214/1738)
- **Functions**: 12.65% (52/411)
- **Lines**: 17.79% (639/3590)

### Test Suite

- **Total Test Suites**: 17
- **Total Tests**: 212
- **Pass Rate**: 100%

## Completed Testing

### Core Utilities (Excellent Coverage)

✅ **config.ts** - 17 tests

- Environment variable loading
- Configuration validation
- Default values
- Storage configuration priority

✅ **logger.ts** - 15 tests

- Logger creation
- Log levels
- Redis URL sanitization
- Context handling

✅ **database.ts** - 24 tests

- Database initialization
- Schema management
- Query execution
- Error handling

✅ **apps/raincloud/src/di/di-container.ts** - 17 tests

- Service registration
- Singleton pattern
- Dependency injection
- Clear/reset functionality

### Server Components (Good Coverage)

✅ **requestLogger middleware** - 12 tests

- Request/response logging
- Status code handling
- Duration tracking
- Header handling

✅ **roleVerifier utility** - 12 tests

- Role verification across guilds
- User membership checks
- Error handling
- Edge cases

### Existing Tests (Already Present)

✅ **sourceType.ts** - 9 tests
✅ **listeningHistory.ts** - 17 tests
✅ **playerEmbed.ts** - Partial coverage
✅ **trackMetadata.ts** - Partial coverage
✅ **connectionManager.ts** - Partial coverage
✅ **constants.ts** - Full coverage
✅ **soundboardErrorHandling** - Integration tests
✅ **queueAndOverlay** - Integration tests
✅ **Server routes** - Stats, rate limiting, user-sounds

## Testing Priority Matrix

### High Priority (Critical Business Logic)

These modules need comprehensive testing to reach 60-80% coverage:

1. **Voice Subsystem** (Currently ~4% coverage)
   - `playbackManager.ts` - Core playback orchestration
   - `queueManager.ts` - Queue manipulation and concurrency
   - `audioResource.ts` - Audio streaming and resource creation
   - `snapshotManager.ts` - State persistence
   - `snapshotPersistence.ts` - Filesystem operations
   - `soundboardManager.ts` - Soundboard handling

2. **Statistics** (Currently ~13% coverage)
   - `statistics.ts` - Event tracking and batch processing
   - Test command stats, sound stats, user sessions

3. **Storage** (Currently 0% coverage)
   - `storage.ts` - S3/local file operations
   - Upload, download, list, delete operations

### Medium Priority

4. **Command Deployment**
   - `deployCommands.ts` - Command loading and deployment

5. **Voice Manager**
   - `voiceManager.ts` - High-level voice coordination

6. **Track Fetcher**
   - `trackFetcher.ts` - URL validation and metadata fetching

### Lower Priority

7. **Server Routes**
   - Additional API endpoint tests
   - Auth flow testing

8. **Integration Tests**
   - End-to-end workflows
   - Multi-component interactions

## Recommended Next Steps

### Phase 1: Voice Subsystem (Target: +30% coverage)

Focus on voice utilities as they're the most critical:

```bash
# Create tests for:
utils/voice/__tests__/playbackManager.test.ts
utils/voice/__tests__/queueManager.test.ts
utils/voice/__tests__/audioResource.test.ts
utils/voice/__tests__/snapshotManager.test.ts
utils/voice/__tests__/soundboardManager.test.ts
```

**Key test scenarios**:

- Play track successfully
- Handle queue operations
- Manage voice connections
- Error recovery
- Concurrent access (mutex testing)

### Phase 2: Statistics Module (Target: +15% coverage)

```bash
utils/__tests__/statistics.test.ts
```

**Key test scenarios**:

- Event buffering
- Batch processing
- Database writes
- Event emitter notifications

### Phase 3: Storage Module (Target: +10% coverage)

```bash
utils/__tests__/storage.test.ts
```

**Key test scenarios**:

- S3 operations (mock AWS SDK)
- File validation
- Error handling
- Stream processing

### Phase 4: Integration Tests (Target: +5% coverage)

```bash
__tests__/integration/
  voice-playback.test.ts
  queue-management.test.ts
  soundboard.test.ts
```

## Testing Best Practices

### Mock External Dependencies

```typescript
jest.mock('@discordjs/voice');
jest.mock('play-dl');
jest.mock('@aws-sdk/client-s3');
jest.mock('pg');
```

### Test Structure Pattern

```typescript
describe('Module', () => {
  beforeEach(() => {
    // Setup mocks and test fixtures
  });

  describe('Function', () => {
    it('handles success case', () => {
      // Arrange, Act, Assert
    });

    it('handles error case', () => {
      // Test error handling
    });

    it('validates edge cases', () => {
      // Test boundary conditions
    });
  });
});
```

### Voice Module Testing Gotchas

1. **Mutex Testing**: Use `async-mutex` properly for concurrency tests
2. **Discord.js Mocking**: Create comprehensive mocks for voice connections
3. **Audio Streaming**: Mock stream creation and resource handling
4. **play-dl**: Mock YouTube/Spotify API responses

## Coverage Goals

### Short-term (Current PR)

- ✅ Establish testing infrastructure
- ✅ Add comprehensive tests for core utilities
- ✅ Document testing practices
- ✅ Configure coverage reporting
- Target: 15-20% coverage with high-quality tests

### Medium-term (Next 2-3 PRs)

- Voice subsystem comprehensive testing
- Statistics module testing
- Storage module testing
- Target: 40-50% coverage

### Long-term (Ongoing)

- Integration test suite
- E2E testing for critical workflows
- Maintain 60-80% coverage as codebase grows
- Regular coverage monitoring in CI

## CI Integration

### Coverage Enforcement

Current thresholds in `jest.config.js`:

```javascript
coverageThreshold: {
  global: {
    statements: 15,
    branches: 10,
    functions: 10,
    lines: 15,
  },
}
```

### Gradual Increase Strategy

1. Start at 15% (current level)
2. Increase by 5-10% per major testing initiative
3. Reach 60% within 6-12 months
4. Maintain 80% for new code

## Testing Tools & Commands

```bash
# Run all tests
npm test

# Watch mode for TDD
npm run test:watch

# Coverage report
npm run test:coverage

# Type checking
npm run type-check

# Linting
npm run lint

# Full validation
npm run validate
```

## Documentation Links

- [Jest Configuration](jest.config.js)
- [TypeScript Config](tsconfig.json)
- [Testing in README](README.md#testing)
- [Voice Architecture](utils/voice/README.md)
- [Architecture Decisions](ARCHITECTURE.md)
