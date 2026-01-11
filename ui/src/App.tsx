import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import LoadingOverlay from './components/LoadingOverlay'

function App() {
  const { checkAuth, isLoading, isAuthenticated } = useAuthStore()

  useEffect(() => {
    // Check auth on mount
    // After OAuth callback (/auth/discord/callback), server redirects to / and we check auth again
    // Add a small delay to ensure session cookie is set after OAuth redirect
    const checkAuthWithDelay = async () => {
      // If we just came from OAuth (check URL params or referrer), wait a bit
      const urlParams = new URLSearchParams(globalThis.location.search);
      const fromOAuth = document.referrer.includes('/auth/discord') || urlParams.has('code');
      
      if (fromOAuth) {
        console.log('[App] Detected OAuth redirect, waiting for session cookie...');
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms for cookie
      }
      
      console.log('[App] Checking auth...');
      const authenticated = await checkAuth();
      console.log('[App] Auth check result:', authenticated);
      
      // If still not authenticated after OAuth redirect, retry once
      if (!authenticated && fromOAuth) {
        console.log('[App] Retrying auth check after OAuth...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        await checkAuth();
      }
    };
    
    checkAuthWithDelay();
  }, [checkAuth])

  if (isLoading) {
    return <LoadingOverlay />
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          isAuthenticated ? (
            <Layout>
              <DashboardPage />
            </Layout>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
  )
}

export default App
