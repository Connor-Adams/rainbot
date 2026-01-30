import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.tsx';
import { apiBaseUrl, authBaseUrl } from './lib/api';
import ErrorBoundary from './components/ErrorBoundary';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5000,
    },
  },
});

const envApiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const envAuthBaseUrl = import.meta.env.VITE_AUTH_BASE_URL;
const runtimeConfig =
  (globalThis as { __RAINBOT_CONFIG__?: Record<string, string> }).__RAINBOT_CONFIG__ || {};
console.info('[UI] Config:', {
  runtimeApiBaseUrl: runtimeConfig['VITE_API_BASE_URL'] || '(unset)',
  runtimeAuthBaseUrl: runtimeConfig['VITE_AUTH_BASE_URL'] || '(unset)',
  envApiBaseUrl: envApiBaseUrl || '(unset)',
  envAuthBaseUrl: envAuthBaseUrl || '(unset)',
  apiBaseUrl,
  authBaseUrl,
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then(() => {
        console.info('[UI] Service worker registered');
      })
      .catch((error) => {
        console.error('[UI] Service worker registration failed', error);
      });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary
        onError={(error, errorInfo) => console.error('[UI] Uncaught error:', error, errorInfo)}
      >
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ErrorBoundary>
    </QueryClientProvider>
  </StrictMode>
);
