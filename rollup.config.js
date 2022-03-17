import typescript from '@rollup/plugin-typescript';
import { terser } from 'rollup-plugin-terser';

export default ({ watch }) => ({
  input: './tools/awp.ts',
  output: {
    file: './public/awp.js',
    format: 'iife',
    compact: !watch
  },
  plugins: [
    typescript({
      tsconfig: './tools/tsconfig.json'
    }),
    !watch && terser()
  ]
});
