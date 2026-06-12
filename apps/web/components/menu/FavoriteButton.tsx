"use client";

import { useState, useTransition } from "react";
import { toggleFavoriteAction } from "@/app/actions";
import { getThemedButton } from "@/lib/components/button-registry";
import { useThemeOptional } from "@/lib/theme/client";

export function FavoriteButton({ productId, initialIsFavorite = false, tenantSlug }: { productId: string, initialIsFavorite?: boolean, tenantSlug: string }) {
    const [isFavorite, setIsFavorite] = useState(initialIsFavorite);
    const [isPending, startTransition] = useTransition();
    const theme = useThemeOptional();
    const componentSet = theme?.componentSet ?? "default";
    const Button = getThemedButton({ componentSet, tenantOverrideKey: tenantSlug });

    const toggle = async (e: React.MouseEvent) => {
        e.preventDefault(); // Prevent link navigation if inside <a>
        e.stopPropagation();

        const newState = !isFavorite;
        setIsFavorite(newState); // Optimistic

        startTransition(async () => {
            try {
                await toggleFavoriteAction(productId, tenantSlug);
            } catch (err) {
                console.error("Failed to toggle favorite", err);
                setIsFavorite(!newState); // Revert
            }
        });
    };

    return (
        <Button
            type="button"
            variant="ghost"
            onClick={toggle}
            disabled={isPending}
            className="favorite-btn p-1 flex items-center justify-center transition-transform duration-100"
        >
            <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill={isFavorite ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={isFavorite ? "text-ink" : "text-muted"}
            >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
        </Button>
    );
}
