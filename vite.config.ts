import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import replace from '@rollup/plugin-replace';
import { execSync } from 'child_process';

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
  plugins: [preact()]
});
