import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: [],
        include: ['__tests__/**/*.{test,spec}.{ts,tsx,js,jsx}'],
        exclude: ['**/node_modules/**', '**/tests/**'],
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './'),
        },
    },
});
