// ESLint 9 Flat Config for BFF
// Focus: Prevent 'any' types, clean up unused variables
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
    // 1. GLOBAL IGNORES (What ESLint should never touch)
    {
        ignores: ['dist/**', 'node_modules/**', 'coverage/**', '.next/**']
    },

    // 2. BASE CONFIGURATION (Applies to ALL .ts files)
    // Strict rules enabled by default for everything
    {
        files: ['src/**/*.ts'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                project: './tsconfig.lint.json'
            }
        },
        plugins: {
            '@typescript-eslint': tsPlugin
        },
        rules: {
            // Strict rules for all files by default
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['warn', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_'
            }],
            'no-console': ['warn', { allow: ['warn', 'error'] }]
        }
    },

    // 3. TEST & TOOLS OVERRIDES (Cascading override)
    // This block comes AFTER base config and overrides specific rules
    {
        files: ['src/**/__tests__/**/*.ts', 'src/tools/**/*.ts'],
        // No need to duplicate parser/plugins - they cascade from base!
        rules: {
            // Relax only these specific rules for tests
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
            'no-console': 'off'
        }
    }
];
