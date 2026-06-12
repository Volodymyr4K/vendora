"use client";

import React from "react";
import type { ButtonProps } from "@/lib/components/button-registry";

export function MinimalButton({ variant, className, style, ...props }: ButtonProps) {
    const baseClass = "px-4 py-2 rounded-theme transition-colors duration-200 border shadow-theme";
    const variantClass = variant === "primary"
        ? "bg-ink text-paper border border-line hover:opacity-90"
        : "bg-paper text-ink border border-line hover:bg-[var(--bg)]";
    const finalClass = `${baseClass} ${variantClass} ${className ?? ""}`.trim();

    if ("href" in props && typeof props.href === "string") {
        const { href, ...anchorProps } = props;
        return <a href={href} className={finalClass} style={style} {...(anchorProps as React.AnchorHTMLAttributes<HTMLAnchorElement>)} />;
    }

    return <button className={finalClass} style={style} {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)} />;
}
