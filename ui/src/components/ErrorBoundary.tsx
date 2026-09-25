import React, { Component } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui';

/**
 * A `fallback` that needs the boundary's own retry — the one thing a static
 * `ReactNode` cannot reach, because `handleRetry` lives on the instance.
 */
type ErrorFallbackRender = (props: { error: Error | null; onRetry: () => void }) => ReactNode;

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * A specialised panel for this subtree. Pass a FUNCTION when the panel needs
   * to offer a retry: a static node is rendered as-is, which is how
   * `StatsErrorBoundary` ended up with a panel that told the user to reload the
   * page because it had no way to ask the boundary to try again.
   */
  fallback?: ReactNode | ErrorFallbackRender;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * The default "something broke" panel, factored out of `ErrorBoundary.render`
 * so a specialised boundary can reuse the exact same markup for the errors it
 * does not want to treat specially (see `RouteErrorBoundary`).
 */
export function DefaultErrorFallback({
  error,
  onRetry,
}: {
  error: Error | null;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-surface p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface-input text-xl font-semibold text-primary">
        !
      </div>
      <h3 className="text-xl font-semibold text-text-primary">Something went wrong</h3>
      <p className="max-w-md text-sm text-text-secondary">
        An error occurred while loading this content. This might be due to missing data or a
        temporary issue.
      </p>
      {error && (
        <details className="w-full max-w-md rounded-lg border border-border bg-surface-input p-3 text-left">
          <summary className="cursor-pointer text-sm text-text-secondary hover:text-text-primary">
            Error details
          </summary>
          <pre className="mt-2 max-h-40 overflow-auto text-xs text-danger-light">
            {error.message}
          </pre>
        </details>
      )}
      <Button onClick={onRetry} variant="primary">
        Try Again
      </Button>
    </div>
  );
}

/**
 * Error Boundary component that catches JavaScript errors in child components
 * and displays a fallback UI instead of crashing the whole app.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const { fallback } = this.props;
      if (typeof fallback === 'function') {
        return fallback({ error: this.state.error, onRetry: this.handleRetry });
      }
      if (fallback) {
        return fallback;
      }

      return <DefaultErrorFallback error={this.state.error} onRetry={this.handleRetry} />;
    }

    return this.props.children;
  }
}

/**
 * StatsErrorBoundary - Specialized error boundary for stats components
 * with stats-specific messaging.
 *
 * The `fallback` is a FUNCTION, not a node, so the panel can offer the
 * boundary's own retry. As a static node it had no "Try Again" — and because
 * `render()` returns a provided fallback *before* `DefaultErrorFallback`, that
 * also meant no retry was reachable at all. One render-phase throw in one of the
 * 21 sections (a single malformed payload field is enough) then wedged the whole
 * tab, with a full page reload the only way out.
 *
 * `StatisticsTab` keys this boundary on the active section — the same shape
 * `Layout` uses for `RouteErrorBoundary` — so switching sections clears
 * `hasError` too. Both halves are needed: the retry recovers the section you are
 * on, the key stops a broken section from blocking the other twenty.
 */
export function StatsErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={({ onRetry }) => (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-surface p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface-input text-xl font-semibold text-secondary">
            i
          </div>
          <h3 className="text-xl font-semibold text-text-primary">Statistics Unavailable</h3>
          <p className="max-w-md text-sm text-text-secondary">
            Unable to load statistics. This could be because there's no data yet, or a temporary
            server issue.
          </p>
          <Button onClick={onRetry} variant="primary">
            Try Again
          </Button>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

/**
 * The browser-specific wording for "the `import()` for a lazy chunk never
 * arrived". There is no error code and no shared `name` to key off, so the
 * message is all we get:
 *   - Chromium: "Failed to fetch dynamically imported module: <url>"
 *   - Firefox:  "error loading dynamically imported module"
 *   - Safari:   "Importing a module script failed."
 * plus the classic-script wording browsers use when the response is an error
 * page rather than JavaScript.
 */
const CHUNK_LOAD_ERROR_PATTERNS = [
  'failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'importing a module script failed',
  'failed to load module script',
];

/**
 * True when `error` is a lazy chunk that could not be downloaded or parsed.
 * Deliberately module-private: exporting a non-component from a file of
 * components trips `react-refresh/only-export-components`, and nothing outside
 * this file needs it.
 */
function isChunkLoadError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();
  return CHUNK_LOAD_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

/**
 * Fallback for a chunk that failed to download. The offer is a full page
 * reload, and that is deliberate — it is the only thing that can recover.
 *
 * The usual cause is a deploy: the browser is holding an `index.html` from the
 * previous build, whose content-hashed chunk filenames no longer exist on the
 * server. Re-rendering cannot fix that, and neither can `ErrorBoundary`'s
 * ordinary "Try Again", because `React.lazy` memoises its import promise
 * INCLUDING the rejection — once a lazy component has rejected, every later
 * render of it re-throws the same stored error forever. Only a reload fetches a
 * fresh `index.html` and with it the new chunk names.
 *
 * The reload is not automatic: a self-reloading page is a reload loop waiting
 * for a genuinely missing chunk (a bad deploy, an offline user), and it would
 * throw away whatever the rest of the app is holding. The user presses it.
 */
function ChunkLoadErrorFallback({ error }: { error: Error }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-surface p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface-input text-xl font-semibold text-secondary">
        ↻
      </div>
      <h3 className="text-xl font-semibold text-text-primary">This section didn't load</h3>
      <p className="max-w-md text-sm text-text-secondary">
        Part of the dashboard is loaded on demand and this piece could not be fetched. That usually
        means a new version was deployed while this tab was open, or the connection dropped.
        Reloading picks up the current version.
      </p>
      <details className="w-full max-w-md rounded-lg border border-border bg-surface-input p-3 text-left">
        <summary className="cursor-pointer text-sm text-text-secondary hover:text-text-primary">
          Error details
        </summary>
        <pre className="mt-2 max-h-40 overflow-auto text-xs text-danger-light">{error.message}</pre>
      </details>
      <Button onClick={() => window.location.reload()} variant="primary">
        Reload
      </Button>
    </div>
  );
}

/**
 * Boundary for a lazily-loaded route.
 *
 * `React.lazy` rejections surface as ordinary render-phase throws, so a plain
 * error boundary does catch them — but the app's only boundary sits above
 * `BrowserRouter` in `main.tsx`, which means a single failed tab chunk replaces
 * the entire app, header and navigation included, leaving no way to go
 * anywhere else. This one sits inside `Layout` around the `<Outlet />`, so the
 * chrome survives and only the content area reports the failure. `Layout` keys
 * it on the pathname so navigating to another tab clears it.
 */
export class RouteErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[RouteErrorBoundary] Caught error:', error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    const { error, hasError } = this.state;
    if (!hasError) return this.props.children;
    if (error && isChunkLoadError(error)) return <ChunkLoadErrorFallback error={error} />;
    return <DefaultErrorFallback error={error} onRetry={this.handleRetry} />;
  }
}
