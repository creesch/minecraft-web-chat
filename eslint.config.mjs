import globals from 'globals';
import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

/** @type {import('eslint').Linter.Config[]} */
export default [
    eslintConfigPrettier,
    {
        ignores: ['build', 'bin'],
    },
    {
        files: ['**/*.{js,mjs,cjs,ts}'],
    },
    {
        languageOptions: {
            globals: globals.browser,
        },
    },
    pluginJs.configs.recommended,
    ...tseslint.configs.recommended,
    {
        rules: {
            'prefer-template': 'warn',
            'no-var': 'error',
            eqeqeq: ['error', 'always', { null: 'ignore' }],
            'require-await': 'warn',
        },
    },
];
