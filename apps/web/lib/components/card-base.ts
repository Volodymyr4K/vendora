import type { ComponentType, HTMLAttributes, CSSProperties } from "react";
import type { ResolvedTheme } from "@vendora/contracts";
import { DefaultCard } from "@/components/cards/DefaultCard";
import { MinimalCard } from "@/components/cards/MinimalCard";

export type ComponentSet = ResolvedTheme["componentSet"];

export type CardProps = HTMLAttributes<HTMLDivElement> & {
    style?: CSSProperties;
    className?: string;
};

export type CardComponent = ComponentType<CardProps>;

export const cardRegistry: Record<ComponentSet, CardComponent> = {
    default: DefaultCard,
    minimal: MinimalCard,
    acme: DefaultCard, // Fallback
};

export function getCard(set: ComponentSet): CardComponent {
    return cardRegistry[set] || cardRegistry.default;
}
