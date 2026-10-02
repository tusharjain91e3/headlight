import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  css: { postcss: { plugins: [] } },
  test: { globals: true, environment: 'jsdom', include: ['tests/**/*.test.{ts,tsx}'] },
  resolve: { alias: { '@': resolve(__dirname) } },
});
