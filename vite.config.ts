import path from 'path';
import { execSync } from 'node:child_process';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Build identity that changes every deploy. Baked into the bundle as
// __APP_VERSION__ and emitted to dist/version.json so the running app can
// poll for "is there a newer build?" without a service-worker dance.
function resolveAppVersion(): string {
    try {
        return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
            .toString()
            .trim();
    } catch {
        return `t${Date.now()}`;
    }
}

const APP_VERSION = resolveAppVersion();

function emitVersionJson(): Plugin {
    return {
        name: 'emit-version-json',
        apply: 'build',
        generateBundle() {
            this.emitFile({
                type: 'asset',
                fileName: 'version.json',
                source: JSON.stringify({ version: APP_VERSION, builtAt: new Date().toISOString() }) + '\n',
            });
        },
    };
}

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react(), emitVersionJson()],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  }
});
