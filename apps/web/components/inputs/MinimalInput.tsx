"use client";

import React from "react";
import type { InputProps } from "@/lib/components/input-registry";

export function MinimalInput({ className, ...props }: InputProps) {
    return <input className={`px-3 py-2 bg-paper border border-line rounded-theme focus:border-[var(--line)] focus:ring-2 focus:ring-[var(--focus-ring-color)] focus:ring-offset-2 focus:ring-offset-[var(--paper)] outline-none transition-colors ${className ?? ""}`.trim()} {...props} />;
}
