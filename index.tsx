
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/common/ErrorBoundary';
import { ToastProvider } from './components/ui/Toast';
import { captureQuickActionFromUrl } from './utils/quickAction';
import './styles.css';

// Capture any launcher-shortcut ?action= param before React renders and any
// route redirect (landing/login -> app) can strip the query string.
captureQuickActionFromUrl();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
