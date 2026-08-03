import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [dts()],
  build: {
    lib: {
      name: 'canvas-glide',
      entry: 'src/canvas-glide.ts',
      formats: ['es', 'umd'],
    },
  },
});
