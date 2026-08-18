import { defineConfig } from 'vitest/config';

// Standalone config (deliberately not merged into vite.config.ts, which is
// Tailwind/PostCSS-wired for the app build): these tests only exercise pure
// utils, so a plain node environment with no plugins is all they need.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
