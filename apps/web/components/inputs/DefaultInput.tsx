"use client";

import React from "react";
import type { InputProps } from "@/lib/components/input-registry";

export function DefaultInput({ className, ...props }: InputProps) {
    // Legacy .input class
    return <input className={`input ${className ?? ""}`.trim()} {...props} />;
}
