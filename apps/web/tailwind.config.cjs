/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './pages/**/*.{js,ts,jsx,tsx,mdx}',
        './components/**/*.{js,ts,jsx,tsx,mdx}',
        './app/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    theme: {
        extend: {
            colors: {
                background: 'var(--background)',
                foreground: 'var(--foreground)',
                bg: 'var(--bg)',
                paper: 'var(--paper)',
                ink: 'var(--ink)',
                muted: 'var(--muted)',
                line: 'var(--line)',
                footer: 'var(--footer-bg)',
                // UPDATED: RGB pattern for opacity support
                accent: {
                    DEFAULT: 'rgb(var(--color-accent-rgb) / <alpha-value>)',
                    foreground: 'var(--text-on-accent)',
                    solid: 'var(--accent)',
                },
                'accent-weak': 'var(--accent-weak)',
                // NEW: States
                'focus-ring': 'var(--focus-ring-color)',
                // Semantic tokens
                surface: {
                    bg: 'var(--surface-bg)',
                    paper: 'var(--surface-paper)',
                    overlay: 'var(--surface-overlay)',
                    scrim: 'var(--surface-scrim)',
                },
                text: {
                    primary: 'var(--text-primary)',
                    secondary: 'var(--text-secondary)',
                },
                border: {
                    DEFAULT: 'var(--border-default)',
                },
                success: {
                    DEFAULT: 'rgb(var(--color-success-rgb) / <alpha-value>)',
                    weak: 'var(--color-success-weak)',
                },
                warning: {
                    DEFAULT: 'rgb(var(--color-warning-rgb) / <alpha-value>)',
                    weak: 'var(--color-warning-weak)',
                },
                danger: {
                    DEFAULT: 'rgb(var(--color-danger-rgb) / <alpha-value>)',
                    weak: 'var(--color-danger-weak)',
                },
                info: {
                    DEFAULT: 'rgb(var(--color-info-rgb) / <alpha-value>)',
                    weak: 'var(--color-info-weak)',
                },
            },
            borderRadius: {
                theme: 'var(--radius)',
            },
            boxShadow: {
                theme: 'var(--shadow)',
                DEFAULT: 'var(--shadow-default)',
            },
            // NEW: Extended Tokens
            fontFamily: {
                theme: 'var(--font-family)',
                sans: 'var(--font-sans)',
                serif: 'var(--font-serif)',
                mono: 'var(--font-mono)',
            },
            fontSize: {
                'theme-base': 'var(--font-size-base)',
                'theme-small': 'var(--font-size-small)',
                'theme-large': 'var(--font-size-large)',
            },
            spacing: {
                'theme-xs': 'var(--space-xs)',
                'theme-s': 'var(--space-s)',
                'theme-m': 'var(--space-m)',
                'theme-l': 'var(--space-l)',
                'theme-xl': 'var(--space-xl)',
            },
            borderWidth: {
                'theme-thin': 'var(--border-width-thin)',
                'theme-thick': 'var(--border-width-thick)',
            },
        },
    },
    plugins: [],
}
