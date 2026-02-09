/**
 * ESLint React Configuration
 *
 * React/JSX-specific rules.
 *
 * Usage:
 *   module.exports = {
 *     extends: [
 *       './eng-platform/configs/eslint/base.js',
 *       './eng-platform/configs/eslint/typescript.js',
 *       './eng-platform/configs/eslint/react.js'
 *     ]
 *   }
 *
 * Requirements:
 *   npm install --save-dev eslint-plugin-react eslint-plugin-react-hooks
 */

module.exports = {
  env: {
    browser: true,
  },

  plugins: ['react', 'react-hooks'],

  extends: [
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],

  settings: {
    react: {
      version: 'detect',
    },
  },

  rules: {
    // React-Specific
    'react/prop-types': 'off', // Using TypeScript for props
    'react/react-in-jsx-scope': 'off', // Not needed in React 17+
    'react/jsx-uses-react': 'off',

    // Hooks
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',

    // JSX
    'react/jsx-no-target-blank': ['error', { enforceDynamicLinks: 'always' }],
    'react/jsx-key': ['error', { checkFragmentShorthand: true }],
    'react/jsx-pascal-case': 'error',
    'react/self-closing-comp': 'error',

    // Best Practices
    'react/no-array-index-key': 'warn',
    'react/no-danger': 'warn',
    'react/no-deprecated': 'error',
    'react/no-unescaped-entities': 'warn',
    'react/jsx-no-useless-fragment': 'warn',
  },
};
