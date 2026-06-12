"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { fetchClient } from "../../../lib/api/fetchClient";
import { useThemeOptional } from "@/lib/theme/client";
import { getThemedButton } from "@/lib/components/button-registry";

function SandboxPaymentContent() {
    const searchParams = useSearchParams();
    // const router = useRouter(); // Unused

    const orderId = searchParams.get("orderId");
    const amount = searchParams.get("amount");
    const token = searchParams.get("token");

    const [phase, setPhase] = React.useState<"idle" | "processing" | "success" | "error">("idle");
    const [error, setError] = React.useState<string | null>(null);

    const theme = useThemeOptional();
    const componentSet = theme?.componentSet ?? "default";
    const Button = getThemedButton({ componentSet, tenantOverrideKey: undefined });

    async function onConfirm() {
        if (!token) return;
        setPhase("processing");
        try {
            const res = await fetchClient("/api/payment/confirm", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ token }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Failed");

            setPhase("success");
            // Redirect back to order page (we need branchSlug, but order token is globally unique so BFF can find it, 
            // but frontend routes need branchSlug. We don't have branchSlug here easily unless we passed it.
            // Actually we can redirect to a global order lookup or just back? 
            // The original plan said redirect to /checkout/success, which implies order status page.
            // Ideally we should pass branchSlug in the payment URL too.
            // But let's assume we can go back or show a link.
            // Actually, standard flow is: payment provider callback -> backend -> redirect to frontend.
            // Here we act as the provider page.
            // Let's just say "Payment Successful" and show a "Back to Shop" or "Check Order" button if we knew the URL.
            // Since we have the token, we can try to assume a branch or use a generic status page if exists.
            // Wait, we can modify PaymentService to include branchSlug in the URL.
            // For now, let's just show Success status.
        } catch (e: unknown) {
            setPhase("error");
            setError(e instanceof Error ? e.message : 'Payment Failed');
        }
    }

    return (
        <div style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 400, margin: "0 auto", textAlign: "center", border: "1px solid var(--line)", borderRadius: 8 }}>
            <h2 style={{ marginBottom: 20 }}>💳 Sandbox Payment</h2>

            <div style={{ marginBottom: 20, textAlign: "left", background: "var(--paper)", padding: 15, borderRadius: 6 }}>
                <div><strong>Order:</strong> {orderId}</div>
                <div><strong>Amount:</strong> {amount} UAH</div>
            </div>

            {phase === "error" && <div className="text-danger" style={{ marginBottom: 20 }}>Error: {error}</div>}

            {phase === "success" ? (
                <div className="text-success" style={{ fontWeight: "bold" }}>
                    ✅ Payment Successfully Simulated!
                    <p style={{ fontSize: 13, color: "var(--muted)", fontWeight: "normal" }}>
                        Your order status has been updated to PAID.
                    </p>
                </div>
            ) : (
                <Button
                    onClick={onConfirm}
                    disabled={phase === "processing"}
                    style={{
                        background: "var(--ink)", color: "var(--paper)", border: "none", padding: "12px 24px",
                        borderRadius: 6, fontSize: 16, cursor: "pointer", width: "100%"
                    }}
                >
                    {phase === "processing" ? "Processing..." : "Simulate Successful Payment"}
                </Button>
            )}
        </div>
    );
}

export default function SandboxPaymentPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <SandboxPaymentContent />
        </Suspense>
    );
}
