import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    target: 'es2019',
    rollupOptions: {
      plugins: [resolve(), commonjs()]
    }
  },
  resolve: {
    alias: {
      react: 'preact/compat',
      'react-dom/test-utils': 'preact/test-utils',
      'react-dom': 'preact/compat',
      'react/jsx-runtime': 'preact/jsx-runtime'
    }
  },
  plugins: [preact()]
});
