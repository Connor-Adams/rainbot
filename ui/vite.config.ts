import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        // Important: preserve cookies for auth
        cookieDomainRewrite: '',
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        /*
         * Two vendor groups, and only two. Route-level `lazy()` in
         * `src/App.tsx` does the actual work of shrinking the first load;
         * this does not move a single byte off the critical path. What it buys
         * is cache lifetime, and the numbers are the justification:
         *
         *   @connor-adams/designsystem   499 kB raw / 192 kB gzip
         *   react + react-dom + scheduler 178 kB raw /  56 kB gzip
         *   app source (src/**)            44 kB raw /  12 kB gzip
         *
         * Left to itself Rolldown packs the design system, react-dom, axios
         * AND `src/lib/api.ts` into one 532 kB chunk, so editing a line of app
         * code invalidates ~286 kB gzipped of dependency bytes that did not
         * change. Pinning the two big stable blobs into their own files drops
         * the per-deploy re-download to the ~12 kB app chunk.
         *
         * Why these two entries cannot backfire the way a hand-written
         * `manualChunks` map usually does: the classic failure is a pattern
         * that yanks a lazy-only dependency forward into the initial graph
         * (matching `node_modules` wholesale would drag recharts out of the
         * statistics chunk and undo this entire change). Neither group here can
         * do that, because both match dependencies that are ALREADY
         * unconditionally in the entry graph — `src/main.tsx` imports `Toaster`
         * and the stylesheet from the design system, and React is React. There
         * is nothing for them to hoist. Any new group added below needs that
         * same property checked, plus a measurement.
         *
         * The `@connor-adams` scope also covers the `/chart` subpath, which the
         * statistics chunk imports. That is deliberate and measured: the
         * subpath is ~1.3 kB, so folding it in costs nothing worth a narrower
         * pattern.
         *
         * Footnote on the 500 kB chunk warning: it goes quiet after this, but
         * the design system chunk clears the threshold by 0.6 kB. That is
         * incidental, not the point — a design system release will trip the
         * warning again, and the honest fix then is on the package side. It
         * ships as ONE 573 kB ESM module with only `.`, `./chart` and
         * `./styles.css` subpaths, so a single `import { Toaster }` in
         * `main.tsx` pins the whole thing into an initial chunk and no amount
         * of app-side splitting can defer the parts only Admin or Statistics
         * use. Per-component entry points in the package would.
         */
        advancedChunks: {
          groups: [
            {
              name: 'vendor-designsystem',
              test: /[\\/]node_modules[\\/]@connor-adams[\\/]/,
            },
            {
              name: 'vendor-react',
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
            },
          ],
        },
      },
    },
  },
});
