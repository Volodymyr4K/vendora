import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
    {
        ignores: ['dist/**', 'node_modules/**', 'prisma/generated/**']
    },
    {
        files: ['**/*.ts'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module'
            }
        },
        plugins: {
            '@typescript-eslint': tsPlugin
        },
        rules: {
            'no-console': 'warn',
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': 'warn'
        }
    },
    {
        files: ['src/**/*.ts'],
        rules: {
            'no-console': 'error'
        }
    },
    {
        files: ['scripts/**/*.ts', 'prisma/**/*.ts', '*.ts'],
        rules: {
            'no-console': 'off'
        }
    }
];
