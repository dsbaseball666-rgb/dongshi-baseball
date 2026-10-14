import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base 設為 './'，讓建置結果可以放在任何靜態網站託管的子路徑（例如 GitHub Pages）
// 兩個網頁：index.html（冒險訓練筆記本）、fitness.html（體能檢測系統）
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        fitness: 'fitness.html',
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
