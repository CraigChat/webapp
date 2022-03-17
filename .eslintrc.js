module.exports = {
  env: {
    es2020: true,
    commonjs: true,
    es6: true,
    browser: true
  },
  globals: {
    JSX: true
  },
  extends: ['preact', 'eslint:recommended', 'plugin:prettier/recommended'],
  parser: '@typescript-eslint/parser',
  rules: {
    'prettier/prettier': 'warn',
    'react/jsx-no-bind': 0,
    'no-cond-assign': [2, 'except-parens'],
    'no-unused-vars': 0,
    'no-empty': [
      'error',
      {
        allowEmptyCatch: true
      }
    ],
    'prefer-const': [
      'warn',
      {
        destructuring: 'all'
      }
    ],
    'spaced-comment': 'warn',
    'jest/no-deprecated-functions': 0
  },
  overrides: [
    {
      files: ['*.d.ts'],
      rules: { 'spaced-comment': 0 }
    }
  ]
};
