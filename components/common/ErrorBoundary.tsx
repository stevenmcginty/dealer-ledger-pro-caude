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
        <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-gray-800 p-8 rounded-xl shadow-2xl border border-red-500/30 max-w-lg w-full">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-900/50 mb-6">
                <ExclamationTriangleIcon className="h-8 w-8 text-red-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
            <p className="text-gray-400 mb-6">The application encountered an unexpected error and cannot continue.</p>
            
            <div className="bg-gray-900 rounded-lg p-4 mb-6 text-left overflow-auto max-h-48">
              <p className="text-red-400 font-mono text-sm break-all">
                {this.state.error && this.state.error.toString()}
              </p>
              {this.state.errorInfo && (
                <pre className="text-gray-500 font-mono text-xs mt-2">
                  {this.state.errorInfo.componentStack}
                </pre>
              )}
            </div>

            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 px-4 bg-brand-600 hover:bg-brand-500 text-white font-medium rounded-lg transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;