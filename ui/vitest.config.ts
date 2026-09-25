import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

/**
 * Test runner for the dashboard.
 *
 * Built on the app's own Vite config (`mergeConfig`) so the `@/*` alias and the
 * React plugin cannot drift between `vite build` and `vitest run` — a test that
 * resolves `@/lib/api` differently from the app is not testing the app.
 *
 * Deliberately NOT configured to pass on an empty suite: `vitest run` exits 1
 * when it finds no test files, which is what keeps `yarn validate` honest.
 * `@rainbot/ui` went a long time with a green gate and no tests; a
 * `--passWithNoTests` stub would put it straight back there.
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: false,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
      // `clearMocks`, not `restoreMocks`: these suites stub `@/lib/api` with a
      // module factory of `vi.fn()`s and re-arm them in `beforeEach`.
      // `mockRestore()` would strip those implementations out from under the
      // factory, so only the call history is reset between tests.
      clearMocks: true,
      unstubEnvs: true,
      css: false,
      server: {
        deps: {
          // `@connor-adams/designsystem`'s entry point starts with
          // `import '../styles.css'`. Left external, Node tries to evaluate the
          // stylesheet as ESM and the whole suite fails to load with
          // `Unknown file extension ".css"`. Inlining routes it through Vite,
          // where `css: false` above turns it into a no-op.
          inline: [/@connor-adams\//],
        },
      },
    },
  })
);
