import type { ComponentType, LabelHTMLAttributes } from "react";
import type { ResolvedTheme } from "@vendora/contracts";
import { DefaultLabel } from "@/components/labels/DefaultLabel";
import { MinimalLabel } from "@/components/labels/MinimalLabel";

export type ComponentSet = ResolvedTheme["componentSet"];

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement>;

export type LabelComponent = ComponentType<LabelProps>;

export const labelRegistry: Record<ComponentSet, LabelComponent> = {
    default: DefaultLabel,
    minimal: MinimalLabel,
    acme: DefaultLabel,
};

// Runtime invariant: labelRegistry.default must exist
if (!labelRegistry.default) {
    throw new Error("labelRegistry.default is required");
}

export function getLabel(set: ComponentSet): LabelComponent {
    return labelRegistry[set] || labelRegistry.default;
}
