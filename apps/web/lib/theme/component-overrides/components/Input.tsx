"use client";

import React from "react";
import type { InputProps, InputComponent } from "@/lib/components/input-base";
import { getInput } from "@/lib/components/input-base";

/**
 * Input component override for demo tenant (default componentSet).
 * Wraps the base Input component and adds tenant-specific styling.
 */
export const VendoraSushiHqInputDefault: InputComponent = ({ className, ...props }: InputProps) => {
    const BaseInput = getInput("default");
    const mergedClassName = `rounded-2xl shadow-theme ${className ?? ""}`.trim();
    
    return (
        <BaseInput
            className={mergedClassName}
            {...props}
            data-tenant-override="vendora-sushi-hq"
        />
    );
};

/**
 * Input component override for demo tenant (minimal componentSet).
 * Wraps the base Input component and adds tenant-specific styling.
 */
export const VendoraSushiHqInputMinimal: InputComponent = ({ className, ...props }: InputProps) => {
    const BaseInput = getInput("minimal");
    const mergedClassName = `rounded-2xl shadow-theme ${className ?? ""}`.trim();
    
    return (
        <BaseInput
            className={mergedClassName}
            {...props}
            data-tenant-override="vendora-sushi-hq"
        />
    );
};

/**
 * Input component override for demo tenant (acme componentSet).
 * Wraps the base Input component and adds tenant-specific styling.
 */
export const VendoraSushiHqInputAcme: InputComponent = ({ className, ...props }: InputProps) => {
    const BaseInput = getInput("acme");
    const mergedClassName = `rounded-2xl shadow-theme ${className ?? ""}`.trim();
    
    return (
        <BaseInput
            className={mergedClassName}
            {...props}
            data-tenant-override="vendora-sushi-hq"
        />
    );
};
