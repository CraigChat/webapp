import preact from '@preact/preset-vite';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import { execSync } from 'child_process';
import { defineConfig } from 'vite';

let revision = Date.now().toString(36);
try {
  revision = execSync('git rev-parse HEAD', { cwd: __dirname }).toString().trim();
} catch (e) {}

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    target: 'es2019',
    rollupOptions: {
      plugins: [replace({ __GIT_REV__: revision }), resolve(), commonjs()]
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
  server: {
    port: 5000,
  },
  plugins: [preact()]
});
