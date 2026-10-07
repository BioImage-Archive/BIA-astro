// Dedicated reporting configuration, not a replacement for the project's normal lint config.
// Target versions: ESLint 9.39.5, eslint-plugin-astro 1.3.1, typescript-eslint 8.48.1.
import astro from 'eslint-plugin-astro';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      '**/node_modules/**', '**/.git/**', '**/.astro/**', '**/dist/**',
      '**/.netlify/**', '**/coverage/**', '**/artifacts/**',
    ],
  },
  {
    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  // Crucially, retain the Astro parser and its client-script processor.
  ...astro.configs['flat/base'],
  {
    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts,astro}'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        vars: 'all', args: 'all', caughtErrors: 'all', ignoreRestSiblings: false,
      }],
      'no-unreachable': 'warn',
      'no-unused-labels': 'warn',
      'no-unused-private-class-members': 'warn',
      'no-useless-assignment': 'warn',
      // A constant expression is a review candidate, not necessarily dead code.
      'no-constant-condition': 'warn',
      'no-constant-binary-expression': 'warn',
    },
  },
  {
    files: ['**/*.astro'],
    processor: 'astro/client-side-ts',
    languageOptions: {
      parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.astro'] },
    },
    rules: {
      'astro/no-unused-define-vars-in-style': 'warn',
      'astro/no-unused-css-selector': 'warn',
    },
  },
  {
    // Ambient declarations are contracts, not ordinary executable locals.
    files: ['**/*.d.ts', '**/*.d.mts', '**/*.d.cts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-private-class-members': 'off',
    },
  },
];
