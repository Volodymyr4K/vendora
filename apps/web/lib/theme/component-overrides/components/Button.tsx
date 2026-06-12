/**
 * Button component override wrapper.
 * Re-exports existing Button implementations from button-registry.
 * This layer provides the foundation for tenant-specific overrides without duplicating UI logic.
 */

"use client";

import React from "react";
import type { ButtonComponent, ButtonProps } from "@/lib/components/button-base";
import { getButton } from "@/lib/components/button-base";

// Re-export existing Button components (no UI changes)
export { DefaultButton } from "@/components/buttons/DefaultButton";
export { MinimalButton } from "@/components/buttons/MinimalButton";

// Re-export Button types
export type { ButtonProps, ButtonComponent } from "@/lib/components/button-registry";

/**
 * Button component override for demo tenant (default componentSet).
 * Wraps the base Button component and adds tenant-specific styling.
 */
export const VendoraSushiHqButtonDefault: ButtonComponent = ({ className, ...props }: ButtonProps) => {
    const BaseButton = getButton("default");
    const mergedClassName = `${className ?? ""} rounded-full shadow-theme`.trim();
    
    return (
        <BaseButton
            className={mergedClassName}
            {...props}
            data-tenant-override="vendora-sushi-hq"
        />
    );
};

/**
 * Button component override for demo tenant (minimal componentSet).
 * Wraps the base Button component and adds tenant-specific styling.
 */
export const VendoraSushiHqButtonMinimal: ButtonComponent = ({ className, ...props }: ButtonProps) => {
    const BaseButton = getButton("minimal");
    const mergedClassName = `${className ?? ""} rounded-full shadow-theme`.trim();
    
    return (
        <BaseButton
            className={mergedClassName}
            {...props}
            data-tenant-override="vendora-sushi-hq"
        />
    );
};

/**
 * Button component override for demo tenant (acme componentSet).
 * Wraps the base Button component and adds tenant-specific styling.
 */
export const VendoraSushiHqButtonAcme: ButtonComponent = ({ className, ...props }: ButtonProps) => {
    const BaseButton = getButton("acme");
    const mergedClassName = `${className ?? ""} rounded-full shadow-theme`.trim();
    
    return (
        <BaseButton
            className={mergedClassName}
            {...props}
            data-tenant-override="vendora-sushi-hq"
        />
    );
};
