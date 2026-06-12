"use client";

import { useThemeOptional } from "@/lib/theme/client";
import { getThemedButton } from "@/lib/components/button-registry";

export default function TestPage() {
    const theme = useThemeOptional();
    const componentSet = theme?.componentSet ?? "default";
    const Button = getThemedButton({ componentSet, tenantOverrideKey: undefined });

    return (
        <div className="min-h-screen bg-gradient-to-br from-accent via-accent/80 to-accent flex items-center justify-center p-8">
            <div className="bg-paper rounded-3xl shadow-2xl p-12 max-w-2xl">
                <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-accent to-accent/80 mb-6">
                    Tailwind CSS Test
                </h1>
                <p className="text-ink text-lg mb-4">
                    If you can see this text in a white box on a purple-pink background - <strong className="text-success">Tailwind works!</strong>
                </p>
                <div className="flex gap-4">
                    <Button
                        className="px-6 py-3 bg-info text-accent-foreground rounded-lg hover:opacity-90 transition-colors"
                        type="button"
                    >
                        Button 1
                    </Button>
                    <Button
                        className="px-6 py-3 bg-danger text-accent-foreground rounded-lg hover:opacity-90 transition-colors"
                        type="button"
                    >
                        Button 2
                    </Button>
                </div>
            </div>
        </div>
    );
}
