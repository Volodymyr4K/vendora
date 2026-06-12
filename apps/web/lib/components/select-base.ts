import type { ComponentType, ComponentProps } from "react";
import type { ResolvedTheme } from "@vendora/contracts";
import { Select as UiSelect } from "@/components/ui/Select";

export type ComponentSet = ResolvedTheme["componentSet"];

export type SelectProps = ComponentProps<typeof UiSelect>;

export type SelectComponent = ComponentType<SelectProps>;

export const selectRegistry: Record<ComponentSet, SelectComponent> = {
    default: UiSelect,
    minimal: UiSelect,
    acme: UiSelect,
};

// Runtime invariant: selectRegistry.default must exist
if (!selectRegistry.default) {
    throw new Error("selectRegistry.default is required");
}

export function getSelect(set: ComponentSet): SelectComponent {
    return selectRegistry[set] || selectRegistry.default;
}
