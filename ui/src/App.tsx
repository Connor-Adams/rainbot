import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import LoadingOverlay from './components/LoadingOverlay';
import PlayerTab from './components/tabs/PlayerTab';
import SoundboardTab from './components/tabs/SoundboardTab';
import RecordingsTab from './components/tabs/RecordingsTab';
import StatisticsTab from './components/tabs/stats/StatisticsTab';
import StatusTab from './components/tabs/StatusTab';
import AdminTab from './components/tabs/AdminTab';

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
      <Route path="/" element={isAuthenticated ? <Layout /> : <Navigate to="/login" replace />}>
        <Route index element={<Navigate to="/player" replace />} />
        <Route path="player" element={<PlayerTab />} />
        <Route path="soundboard" element={<SoundboardTab />} />
        <Route path="recordings" element={<RecordingsTab />} />
        <Route path="stats">
          <Route index element={<Navigate to="/stats/summary" replace />} />
          <Route path=":section" element={<StatisticsTab />} />
        </Route>
        <Route path="status" element={<StatusTab />} />
        <Route path="admin" element={<AdminTab />} />
        <Route path="*" element={<Navigate to="/player" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
