"use client";

import React from "react";
import type { ButtonProps } from "@/lib/components/button-registry";

export function DefaultButton({ variant, className, style, ...props }: ButtonProps) {
    const baseClass = "btn";
    const variantClass = variant === "primary" ? "btnPrimary" : "";
    const finalClass = `${baseClass} ${variantClass} ${className ?? ""}`.trim();

    if ("href" in props && typeof props.href === "string") {
        const { href, ...anchorProps } = props;
        return <a href={href} className={finalClass} style={style} {...(anchorProps as React.AnchorHTMLAttributes<HTMLAnchorElement>)} />;
    }

    return <button className={finalClass} style={style} {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)} />;
}
