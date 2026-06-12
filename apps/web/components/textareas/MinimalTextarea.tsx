"use client";

import React from "react";
import type { TextareaProps } from "@/lib/components/textarea-base";

export function MinimalTextarea({ className, ...props }: TextareaProps) {
    return <textarea className={`w-full resize-none px-3 py-2 bg-paper border border-line rounded-theme focus:border-[var(--line)] focus:ring-2 focus:ring-[var(--focus-ring-color)] focus:ring-offset-2 focus:ring-offset-[var(--paper)] outline-none transition-colors ${className ?? ""}`.trim()} {...props} />;
}
