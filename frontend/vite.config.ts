import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const target = process.env.API_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/session': target,
      '/tools': target,
      '/files': target,
      '/voice': target,
      '/health': target,
      '^/s/[^/]+$': target,
      '/ws': { target, ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
