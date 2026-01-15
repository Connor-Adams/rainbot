import React, { Component } from 'react'
import type { ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * Error Boundary component that catches JavaScript errors in child components
 * and displays a fallback UI instead of crashing the whole app.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-surface p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface-input text-xl font-semibold text-primary">
            !
          </div>
          <h3 className="text-xl font-semibold text-text-primary">Something went wrong</h3>
          <p className="max-w-md text-sm text-text-secondary">
            An error occurred while loading this content. This might be due to missing data or a temporary issue.
          </p>
          {this.state.error && (
            <details className="w-full max-w-md rounded-lg border border-border bg-surface-input p-3 text-left">
              <summary className="cursor-pointer text-sm text-text-secondary hover:text-text-primary">
                Error details
              </summary>
              <pre className="mt-2 max-h-40 overflow-auto text-xs text-red-400">
                {this.state.error.message}
              </pre>
            </details>
          )}
          <button
            onClick={this.handleRetry}
            className="btn btn-primary"
          >
            Try Again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * StatsErrorBoundary - Specialized error boundary for stats components
 * with stats-specific messaging
 */
export function StatsErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-surface p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface-input text-xl font-semibold text-secondary">
            i
          </div>
          <h3 className="text-xl font-semibold text-text-primary">Statistics Unavailable</h3>
          <p className="max-w-md text-sm text-text-secondary">
            Unable to load statistics. This could be because there's no data yet, or a temporary server issue.
          </p>
          <p className="text-xs text-text-muted">Try refreshing the page or check back later.</p>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  )
}
