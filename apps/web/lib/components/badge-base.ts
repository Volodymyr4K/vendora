import type { ComponentType, HTMLAttributes } from "react";
import type { ResolvedTheme } from "@vendora/contracts";
import { DefaultBadge } from "@/components/badges/DefaultBadge";
import { MinimalBadge } from "@/components/badges/MinimalBadge";

export type ComponentSet = ResolvedTheme["componentSet"];

export type BadgeProps = HTMLAttributes<HTMLSpanElement>;

export type BadgeComponent = ComponentType<BadgeProps>;

export const badgeRegistry: Record<ComponentSet, BadgeComponent> = {
    default: DefaultBadge,
    minimal: MinimalBadge,
    acme: DefaultBadge,
};

// Runtime invariant: badgeRegistry.default must exist
if (!badgeRegistry.default) {
    throw new Error("badgeRegistry.default is required");
}

export function getBadge(set: ComponentSet): BadgeComponent {
    return badgeRegistry[set] || badgeRegistry.default;
}
