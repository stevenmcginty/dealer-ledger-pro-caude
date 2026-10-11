
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/common/ErrorBoundary';
import { ToastProvider } from './components/ui/Toast';
import { AppUpdateProvider } from './contexts/AppUpdateContext';
import { captureQuickActionFromUrl } from './utils/quickAction';
import { applyTheme, readThemeMode, resolveTheme, systemPrefersDark } from './utils/themeMode';
import './styles.css';

// Capture any launcher-shortcut ?action= param before React renders and any
// route redirect (landing/login -> app) can strip the query string.
captureQuickActionFromUrl();

// Light/dark on <html> before the first render (index.html already did this
// before first paint; this keeps the app's own code the source of truth).
applyTheme(resolveTheme(readThemeMode(), systemPrefersDark()));

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <AppUpdateProvider>
          <App />
        </AppUpdateProvider>
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
