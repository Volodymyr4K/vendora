"use client";

import React from "react";
import type { CardProps } from "@/lib/components/card-registry";

export function MinimalCard({ className, children, ...props }: CardProps) {
    return (
        <div className={`p-6 bg-paper border border-line rounded-theme shadow-theme ${className ?? ""}`.trim()} {...props}>
            {children}
        </div>
    );
}
