import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // This ensures that all assets (JS, CSS, Images) use relative paths.
  // This is required for GitHub Pages deployment.
  base: './',
  define: {
    'process.env': {
       API_KEY: JSON.stringify(process.env.API_KEY || ""),
       ...process.env
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false
  }
});