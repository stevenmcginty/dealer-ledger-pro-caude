import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ExclamationTriangleIcon } from '../icons';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-6 text-center">
          <div className="w-full max-w-lg rounded-card border border-line bg-surface p-6 text-start">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft">
                <ExclamationTriangleIcon className="h-8 w-8 text-danger-ink" />
            </div>
            <h1 className="mb-2 text-xl font-bold text-ink">Something went wrong</h1>
            <p className="mb-5 text-base text-ink-2">The app hit an error it can’t recover from. Reload to start again; your saved work is safe.</p>
            
            <div className="mb-5 max-h-48 overflow-auto rounded-control bg-surface-2 p-3 text-start">
              <p className="text-danger font-mono text-sm break-all">
                {this.state.error && this.state.error.toString()}
              </p>
              {this.state.errorInfo && (
                <pre className="text-ink-3 font-mono text-xs mt-2">
                  {this.state.errorInfo.componentStack}
                </pre>
              )}
            </div>

            <button
              onClick={() => window.location.reload()}
              className="min-h-[48px] w-full rounded-control bg-accent px-4 text-base font-semibold text-on-accent transition-colors duration-quick hover:bg-accent-hover active:bg-accent-press"
            >
              Reload app
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;