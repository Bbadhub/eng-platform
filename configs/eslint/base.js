/**
 * ESLint Base Configuration
 *
 * Core rules for all JavaScript/TypeScript projects.
 * Extend this in project-specific configs.
 *
 * Usage:
 *   module.exports = {
 *     extends: ['./eng-platform/configs/eslint/base.js']
 *   }
 */

module.exports = {
  env: {
    es2020: true,
    node: true,
  },

  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },

  extends: [
    'eslint:recommended',
  ],

  rules: {
    // Error Prevention
    'no-console': 'warn', // Prevent console.log in production
    'no-debugger': 'error',
    'no-alert': 'error',
    'no-var': 'error',
    'prefer-const': 'error',
    'no-unused-vars': ['error', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_'
    }],

    // Code Quality
    'eqeqeq': ['error', 'always'],
    'curly': ['error', 'all'],
    'brace-style': ['error', '1tbs'],
    'no-multiple-empty-lines': ['error', { max: 1 }],
    'no-trailing-spaces': 'error',
    'comma-dangle': ['error', 'only-multiline'],
    'quotes': ['error', 'single', { avoidEscape: true }],
    'semi': ['error', 'always'],

    // Best Practices
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-return-await': 'error',
    'require-await': 'warn',
    'no-throw-literal': 'error',

    // Complexity
    'max-depth': ['warn', 4],
    'max-lines-per-function': ['warn', { max: 150, skipBlankLines: true, skipComments: true }],
    'complexity': ['warn', 15],
  },

  overrides: [
    {
      files: ['*.test.js', '*.test.ts', '*.test.tsx', '*.spec.js'],
      env: {
        jest: true,
      },
      rules: {
        'max-lines-per-function': 'off', // Tests can be long
        'no-console': 'off', // Allow console in tests
      },
    },
  ],
};
