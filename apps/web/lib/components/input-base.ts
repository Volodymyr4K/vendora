import type { ComponentType, InputHTMLAttributes, CSSProperties } from "react";
import type { ResolvedTheme } from "@vendora/contracts";
import { DefaultInput } from "@/components/inputs/DefaultInput";
import { MinimalInput } from "@/components/inputs/MinimalInput";

export type ComponentSet = ResolvedTheme["componentSet"];

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
    style?: CSSProperties;
    className?: string;
};

export type InputComponent = ComponentType<InputProps>;

export const inputRegistry: Record<ComponentSet, InputComponent> = {
    default: DefaultInput,
    minimal: MinimalInput,
    acme: DefaultInput, // Fallback
};

// Runtime invariant: inputRegistry.default must exist
if (!inputRegistry.default) {
    throw new Error("inputRegistry.default is required");
}

export function getInput(set: ComponentSet): InputComponent {
    return inputRegistry[set] || inputRegistry.default;
}
