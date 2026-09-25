import { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import PlayerTab from './components/tabs/PlayerTab';
import StatusTab from './components/tabs/StatusTab';
import LoadingOverlay from './components/LoadingOverlay';
import {
  AdminTabFallback,
  RecordingsTabFallback,
  SoundboardTabFallback,
  StatisticsTabFallback,
} from './components/routeFallbacks';

/*
 * Route-level code splitting.
 *
 * Eager, and staying eager:
 *   - `PlayerTab` is where `/` redirects, so it is on the critical path by
 *     definition. Splitting it would buy nothing and cost a round trip before
 *     the first interactive paint.
 *   - `StatusTab` shares almost everything it uses with `PlayerTab` — the same
 *     `bot-status` query, the same api client, the same `Button`. Measured by
 *     splitting it anyway: its chunk came out at 3.3 kB raw / 0.97 kB gzipped
 *     while the entry chunk fell by only 0.43 kB gzipped, because the shared
 *     part stays behind either way. Half a kilobyte is not worth a round trip.
 *   - `LoginPage` is on the critical path for exactly the users who have no
 *     session yet, which is the one case where an extra round trip is most
 *     visible, and it is ~2 kB of source.
 *
 * Lazy, each justified by what it drags in:
 *   - `StatisticsTab` owns all 21 stats sections and is the ONLY consumer of
 *     recharts in the app (verify with `grep -rl "from 'recharts'" src` — every
 *     hit is under `components/tabs/stats/`). By far the biggest win.
 *   - `SoundboardTab` owns the `components/soundboard/*` set, and through
 *     `EditModal` it is the entry point to the emoji picker's own dynamic
 *     import — so splitting it keeps `emoji-picker-react` out of the entry
 *     graph entirely rather than merely deferring it.
 *   - `AdminTab` eagerly imports all six admin panels and their form state.
 *   - `RecordingsTab` is smaller than the other three but self-contained, and
 *     it is the one tab most users never open.
 */
const SoundboardTab = lazy(() => import('./components/tabs/SoundboardTab'));
const RecordingsTab = lazy(() => import('./components/tabs/RecordingsTab'));
const StatisticsTab = lazy(() => import('./components/tabs/stats/StatisticsTab'));
const AdminTab = lazy(() => import('./components/tabs/AdminTab'));

const debugEnabled = import.meta.env.DEV;

function App() {
  const { checkAuth, isLoading, isAuthenticated } = useAuthStore();

  useEffect(() => {
    // Check auth on mount
    // After OAuth callback (/auth/discord/callback), server redirects to / and we check auth again
    // Add a small delay to ensure session cookie is set after OAuth redirect
    const checkAuthWithDelay = async () => {
      // If we just came from OAuth (check URL params or referrer), wait a bit
      const urlParams = new URLSearchParams(window.location.search);
      const fromOAuth = document.referrer.includes('/auth/discord') || urlParams.has('code');

      if (fromOAuth) {
        if (debugEnabled) {
          console.log('[App] Detected OAuth redirect, waiting for session cookie...');
        }
        await new Promise((resolve) => setTimeout(resolve, 500)); // Wait 500ms for cookie
      }

      if (debugEnabled) console.log('[App] Checking auth...');
      const authenticated = await checkAuth();
      if (debugEnabled) console.log('[App] Auth check result:', authenticated);

      // If still not authenticated after OAuth redirect, retry once
      if (!authenticated && fromOAuth) {
        if (debugEnabled) console.log('[App] Retrying auth check after OAuth...');
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await checkAuth();
      }
    };

    checkAuthWithDelay();
  }, [checkAuth]);

  if (isLoading) {
    return <LoadingOverlay />;
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={isAuthenticated ? <Layout /> : <Navigate to="/login" replace />}>
        <Route index element={<Navigate to="/player" replace />} />
        <Route path="player" element={<PlayerTab />} />
        {/* Each lazy route carries its own fallback so the placeholder matches
            the shape of the tab that is arriving. The boundary that catches a
            REJECTED chunk lives in `Layout`, around the `<Outlet />`, so a
            failed download leaves the header and navigation usable. */}
        <Route
          path="soundboard"
          element={
            <Suspense fallback={<SoundboardTabFallback />}>
              <SoundboardTab />
            </Suspense>
          }
        />
        <Route
          path="recordings"
          element={
            <Suspense fallback={<RecordingsTabFallback />}>
              <RecordingsTab />
            </Suspense>
          }
        />
        <Route
          path="stats"
          element={
            <Suspense fallback={<StatisticsTabFallback />}>
              <StatisticsTab />
            </Suspense>
          }
        />
        <Route path="status" element={<StatusTab />} />
        <Route
          path="admin"
          element={
            <Suspense fallback={<AdminTabFallback />}>
              <AdminTab />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/player" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
