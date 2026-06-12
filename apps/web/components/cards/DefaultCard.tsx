"use client";

import React from "react";
import type { CardProps } from "@/lib/components/card-registry";

export function DefaultCard({ className, children, ...props }: CardProps) {
    // Legacy .card class
    return (
        <div className={`card ${className ?? ""}`.trim()} {...props}>
            {children}
        </div>
    );
}
