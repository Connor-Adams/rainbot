import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { apiBaseUrl, authBaseUrl } from './lib/api'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5000,
    },
  },
})

const envApiBaseUrl = import.meta.env.VITE_API_BASE_URL
const envAuthBaseUrl = import.meta.env.VITE_AUTH_BASE_URL
console.info('[UI] Config:', {
  envApiBaseUrl: envApiBaseUrl || '(unset)',
  envAuthBaseUrl: envAuthBaseUrl || '(unset)',
  apiBaseUrl,
  authBaseUrl,
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
