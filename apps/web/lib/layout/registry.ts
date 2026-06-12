/**
 * Layout registry for Phase 2.2
 * Maps layoutPreset to layout wrapper components
 * Server-only: must not be imported in client components
 */
import "server-only";

import { DefaultLayout, MinimalLayout } from "@/components/layouts";
import type { ResolvedTheme } from "@vendora/contracts";
import type { ReactNode } from "react";

// Use type from contracts (DRY principle)
type LayoutPreset = ResolvedTheme["layoutPreset"];

// Proper React component type (no JSX in this file)
type LayoutComponent = (props: { children: ReactNode }) => ReactNode;

const FullLayout: LayoutComponent = ({ children }) => children;

export const layoutRegistry: Record<LayoutPreset, LayoutComponent> = {
    default: DefaultLayout,
    minimal: MinimalLayout,
    sidebar: DefaultLayout,  // fallback to Phase 2.3
    grid: DefaultLayout,     // fallback to Phase 2.3
    full: FullLayout,
};

export function getLayout(preset: LayoutPreset): LayoutComponent {
    return layoutRegistry[preset] ?? layoutRegistry.default;
}
