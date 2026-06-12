/**
 * Card component override wrapper.
 * Provides tenant-specific Card overrides.
 */

"use client";

import React from "react";
import type { CardComponent, CardProps } from "@/lib/components/card-base";
import { getCard } from "@/lib/components/card-base";

/**
 * Card component override for demo tenant (default componentSet).
 * Wraps the base Card component and adds tenant-specific styling.
 */
export const VendoraSushiHqCardDefault: CardComponent = ({ className, ...props }: CardProps) => {
    const BaseCard = getCard("default");
    const mergedClassName = `${className ?? ""} rounded-2xl shadow-theme`.trim();
    
    return (
        <BaseCard
            className={mergedClassName}
            {...props}
            data-tenant-override="vendora-sushi-hq"
        />
    );
};

/**
 * Card component override for demo tenant (minimal componentSet).
 * Wraps the base Card component and adds tenant-specific styling.
 */
export const VendoraSushiHqCardMinimal: CardComponent = ({ className, ...props }: CardProps) => {
    const BaseCard = getCard("minimal");
    const mergedClassName = `${className ?? ""} rounded-2xl shadow-theme`.trim();
    
    return (
        <BaseCard
            className={mergedClassName}
            {...props}
            data-tenant-override="vendora-sushi-hq"
        />
    );
};

/**
 * Card component override for demo tenant (acme componentSet).
 * Wraps the base Card component and adds tenant-specific styling.
 */
export const VendoraSushiHqCardAcme: CardComponent = ({ className, ...props }: CardProps) => {
    const BaseCard = getCard("acme");
    const mergedClassName = `${className ?? ""} rounded-2xl shadow-theme`.trim();
    
    return (
        <BaseCard
            className={mergedClassName}
            {...props}
            data-tenant-override="vendora-sushi-hq"
        />
    );
};
