import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from '@connor-adams/designsystem';
import '@connor-adams/designsystem/styles.css';
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
      {/* The one toast host. It is not a provider and holds no state: the queue
          is a module-level store in the design system, so `toast()` reaches this
          stack from anywhere — components, fetch layers, non-React code — with
          no wiring. Mounted outside ErrorBoundary so a crashed tree can still
          be reported through a toast.

          duration={4000} keeps the app's existing 4s auto-dismiss (the host
          default is 5s). The enter/exit transition is the design system's
          (200ms rise-and-scale in, 180ms out) rather than the old 400ms
          slide-from-right, because the 180ms exit is the store's own removal
          timer and is not overridable from CSS.

          z-toast (1000) overrides the host's built-in z-index: 80, which would
          otherwise sit under z-modal (100) and the soundboard menu (900). */}
      <Toaster duration={4000} className="z-toast" />
    </QueryClientProvider>
  </StrictMode>
);
