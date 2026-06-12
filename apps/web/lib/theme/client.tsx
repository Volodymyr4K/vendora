"use client";

import React, { createContext, useContext } from "react";
import type { ResolvedTheme } from "@vendora/contracts";

// 1. Context
const ThemeContext = createContext<ResolvedTheme | null>(null);

// 2. Provider
export function ThemeProvider({
    value,
    children,
}: {
    value: ResolvedTheme;
    children: React.ReactNode;
}) {
    const { Provider } = ThemeContext;
    return <Provider value={value}>{children}</Provider>;
}

// 3. Hook
export function useTheme(): ResolvedTheme {
    const theme = useContext(ThemeContext);
    if (!theme) {
        throw new Error(
            "useTheme must be used within a ThemeProvider. Check if the component is rendered inside a layout with ThemeProvider."
        );
    }
    return theme;
}

// 4. Optional hook (non-throwing)
export function useThemeOptional(): ResolvedTheme | null {
    return useContext(ThemeContext);
}
