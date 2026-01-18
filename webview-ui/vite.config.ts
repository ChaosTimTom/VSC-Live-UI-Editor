import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Important for VS Code webview asset loading.
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
