module.exports = {
  extends: 'snazzah',
  env: {
    browser: true
  },
  globals: {
    JSX: true
  },
  rules: {
    '@typescript-eslint/no-non-null-assertion': 0,
    '@typescript-eslint/ban-ts-comment': 0
  },
  overrides: [
    {
      files: ['*.tsx'],
      extends: ['preact', 'snazzah'],
      rules: {
        '@typescript-eslint/no-non-null-assertion': 0,
        'jest/no-deprecated-functions': 0,
        '@typescript-eslint/ban-ts-comment': 0,
        '@typescript-eslint/no-empty-function': 0
      }
    },
    {
      files: ['awp.ts'],
      parserOptions: {
        project: './tools/tsconfig.json'
      }
    },
    {
      files: ['vite.config.ts'],
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.node.json']
      }
    }
  ]
};
