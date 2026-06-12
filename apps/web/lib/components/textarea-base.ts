import type { ComponentType, TextareaHTMLAttributes, CSSProperties } from "react";
import type { ResolvedTheme } from "@vendora/contracts";
import { DefaultTextarea } from "@/components/textareas/DefaultTextarea";
import { MinimalTextarea } from "@/components/textareas/MinimalTextarea";

export type ComponentSet = ResolvedTheme["componentSet"];

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
    style?: CSSProperties;
    className?: string;
};

export type TextareaComponent = ComponentType<TextareaProps>;

export const textareaRegistry: Record<ComponentSet, TextareaComponent> = {
    default: DefaultTextarea,
    minimal: MinimalTextarea,
    acme: DefaultTextarea, // Fallback
};

// Runtime invariant: textareaRegistry.default must exist
if (!textareaRegistry.default) {
    throw new Error("textareaRegistry.default is required");
}

export function getTextarea(set: ComponentSet): TextareaComponent {
    return textareaRegistry[set] || textareaRegistry.default;
}
