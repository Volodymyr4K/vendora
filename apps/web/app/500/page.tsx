'use client';

import { useThemeOptional } from "@/lib/theme/client";
import { getThemedButton } from "@/lib/components/button-registry";

export default function InternalErrorPage() {
    const theme = useThemeOptional();
    const componentSet = theme?.componentSet ?? "default";
    const Button = getThemedButton({ componentSet, tenantOverrideKey: undefined });

    return (
        <div className="min-h-screen flex items-center justify-center bg-paper">
            <div className="text-center px-4">
                <h1 className="text-6xl font-bold text-ink mb-4">⚠️</h1>
                <h2 className="text-3xl font-semibold text-ink mb-2">
                    Something Went Wrong
                </h2>
                <p className="text-muted mb-6 max-w-md mx-auto">
                    Our servers are experiencing issues. Please try again later.
                </p>
                <Button
                    type="button"
                    variant="primary"
                    onClick={() => window.location.reload()}
                    className="inline-block px-6 py-3 bg-accent text-accent-foreground rounded-lg hover:opacity-90 transition"
                >
                    Retry
                </Button>
            </div>
        </div>
    );
}
