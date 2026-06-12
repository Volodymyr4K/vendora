"use client";

import React from "react";
import type { TextareaProps } from "@/lib/components/textarea-base";

const BASE = "w-full bg-[var(--bg)] border border-line rounded-theme p-2 text-sm focus:outline-none focus:border-[var(--line)] transition-colors resize-none";

export function DefaultTextarea({ className, ...props }: TextareaProps) {
    return <textarea className={`${BASE} ${className ?? ""}`.trim()} {...props} />;
}
