import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    maxWorkers: 3,
    testTimeout: 10000,
    include: ['tests/frontend/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/frontend/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['frontend/src/**/*.{ts,tsx}'],
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: 'coverage/frontend',
    },
  },
});
