import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  // Important for VS Code webview asset loading.
  base: './',
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        appMode: resolve(__dirname, 'appMode.html'),
      }
    },
    outDir: 'dist',
    emptyOutDir: true
  }
});
