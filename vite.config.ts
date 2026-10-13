import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base 設為 './'，讓建置結果可以放在任何靜態網站託管的子路徑（例如 GitHub Pages）
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
