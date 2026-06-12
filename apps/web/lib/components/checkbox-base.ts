import type { ComponentType, InputHTMLAttributes } from "react";
import type { ResolvedTheme } from "@vendora/contracts";
import { DefaultCheckbox } from "@/components/checkboxes/DefaultCheckbox";
import { MinimalCheckbox } from "@/components/checkboxes/MinimalCheckbox";

export type ComponentSet = ResolvedTheme["componentSet"];

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export type CheckboxComponent = ComponentType<CheckboxProps>;

export const checkboxRegistry: Record<ComponentSet, CheckboxComponent> = {
    default: DefaultCheckbox,
    minimal: MinimalCheckbox,
    acme: DefaultCheckbox,
};

// Runtime invariant: checkboxRegistry.default must exist
if (!checkboxRegistry.default) {
    throw new Error("checkboxRegistry.default is required");
}

export function getCheckbox(set: ComponentSet): CheckboxComponent {
    return checkboxRegistry[set] || checkboxRegistry.default;
}
