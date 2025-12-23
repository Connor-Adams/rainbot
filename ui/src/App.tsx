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
    checkAuth()
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
