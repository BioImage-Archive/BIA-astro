// Source structure audit, independent of unused-code rules.
// Reference API profile: ESLint 9; eslint-plugin-astro 1.3.1; typescript-eslint 8.
import astro from 'eslint-plugin-astro';
import tseslint from 'typescript-eslint';
import markup from '../../scripts/markup/explicit-closing-tags.mjs';

export default [
  { ignores: ['**/node_modules/**', '**/.git/**', '.astro/**', 'dist/**', '.netlify/**', 'artifacts/**', 'coverage/**'] },
  ...astro.configs['flat/base'],
  {
    files: ['**/*.astro'],
    processor: 'astro/client-side-ts',
    languageOptions: {
      parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.astro'] },
    },
    plugins: { markup },
    rules: {
      // Legacy v1.3.1 profile only; newer plugin docs deprecate this.
      // Run project-wide `astro check` separately regardless.
      'astro/valid-compile': 'error',
      'markup/explicit-closing-tags': 'error',
    },
  },
  {
    files: ['**/*.astro/*.ts'],
    languageOptions: { parser: tseslint.parser, parserOptions: { project: null } },
  },
];
