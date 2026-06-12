import type { ComponentType, ButtonHTMLAttributes, AnchorHTMLAttributes, CSSProperties } from "react";
import type { ResolvedTheme } from "@vendora/contracts";
import { DefaultButton } from "@/components/buttons/DefaultButton";
import { MinimalButton } from "@/components/buttons/MinimalButton";

export type ComponentSet = ResolvedTheme["componentSet"];

export type ButtonBase = {
    variant?: "primary" | "secondary" | "outline" | "ghost";
    className?: string; // for layout (margins, width)
    style?: CSSProperties;
    children?: React.ReactNode;
};

export type ButtonAsButtonProps = ButtonBase & ButtonHTMLAttributes<HTMLButtonElement> & {
    href?: undefined;
};

export type ButtonAsLinkProps = ButtonBase & AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
};

export type ButtonProps = ButtonAsButtonProps | ButtonAsLinkProps;

export type ButtonComponent = ComponentType<ButtonProps>;

export const buttonRegistry: Record<ComponentSet, ButtonComponent> = {
    default: DefaultButton,
    minimal: MinimalButton,
    acme: DefaultButton, // Fallback
};

// Runtime invariant: buttonRegistry.default must exist
if (!buttonRegistry.default) {
    throw new Error("buttonRegistry.default is required");
}

export function getButton(set: ComponentSet): ButtonComponent {
    return buttonRegistry[set] || buttonRegistry.default;
}
