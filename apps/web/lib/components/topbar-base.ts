import type React from "react";
import type { BranchConfig, ResolvedTheme } from "@vendora/contracts";
import { BranchTopbar } from "@/components/Topbar";
import { MinimalTopbar } from "@/components/topbars/MinimalTopbar";

// Base props matching BranchTopbar signature
export type TopbarProps = {
    cfg: BranchConfig;
    tenantSlug?: string;
};

export type TopbarComponent = React.ComponentType<TopbarProps>;
type ComponentSet = ResolvedTheme["componentSet"];

export const topbarRegistry: Record<ComponentSet, TopbarComponent> = {
    default: BranchTopbar,
    minimal: MinimalTopbar,
    acme: BranchTopbar, // fallback to default
};

export function getTopbar(set: ComponentSet): TopbarComponent {
    return topbarRegistry[set] ?? topbarRegistry.default;
}
