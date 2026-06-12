import type { ComponentType, InputHTMLAttributes } from "react";
import type { ResolvedTheme } from "@vendora/contracts";
import { DefaultRadio } from "@/components/radios/DefaultRadio";
import { MinimalRadio } from "@/components/radios/MinimalRadio";

export type ComponentSet = ResolvedTheme["componentSet"];

export type RadioProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export type RadioComponent = ComponentType<RadioProps>;

export const radioRegistry: Record<ComponentSet, RadioComponent> = {
    default: DefaultRadio,
    minimal: MinimalRadio,
    acme: DefaultRadio,
};

// Runtime invariant: radioRegistry.default must exist
if (!radioRegistry.default) {
    throw new Error("radioRegistry.default is required");
}

export function getRadio(set: ComponentSet): RadioComponent {
    return radioRegistry[set] || radioRegistry.default;
}
