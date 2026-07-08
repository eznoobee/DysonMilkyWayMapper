import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [viteSingleFile()],
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 4096,
  },
  test: {
    environment: 'node',
  },
});
