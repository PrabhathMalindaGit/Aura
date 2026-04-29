import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/tests/e2e/**'],
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,
    sequence: {
      hooks: 'list',
    },
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
