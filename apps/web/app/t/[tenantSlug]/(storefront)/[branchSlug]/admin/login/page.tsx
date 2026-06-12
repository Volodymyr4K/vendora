"use client";

import React, { useActionState } from "react";
import { loginAction } from "@/app/actions";
import { useThemeOptional } from "@/lib/theme/client";
import { getThemedInput } from "@/lib/components/input-registry";
import { getThemedButton } from "@/lib/components/button-registry";

export default function LoginPage({ params }: { params: Promise<{ tenantSlug: string; branchSlug: string }> }) {
    const { branchSlug, tenantSlug } = React.use(params);
    const [state, formAction, isPending] = useActionState(loginAction, null);
    const theme = useThemeOptional();
    const componentSet = theme?.componentSet ?? "default";
    const Input = getThemedInput({ componentSet, tenantOverrideKey: tenantSlug });
    const Button = getThemedButton({ componentSet, tenantOverrideKey: tenantSlug });

    return (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "80vh" }}>
            <div className="card" style={{ width: "100%", maxWidth: 360, padding: 30 }}>
                <h2 style={{ textAlign: "center", marginBottom: 20 }}>Admin Login</h2>

                <form action={formAction} style={{ display: "grid", gap: 15 }}>
                    <input type="hidden" name="branchSlug" value={branchSlug} />
                    <input type="hidden" name="tenantSlug" value={tenantSlug} />

                    <label>
                        <div className="muted" style={{ marginBottom: 4 }}>Username</div>
                        <Input name="username" className="input" style={{ width: "100%" }} required autoFocus />
                    </label>

                    <label>
                        <div className="muted" style={{ marginBottom: 4 }}>Password</div>
                        <Input name="password" type="password" className="input" style={{ width: "100%" }} required />
                    </label>

                    {state?.error && <div className="danger" style={{ textAlign: "center" }}>{state.error}</div>}

                    <Button type="submit" variant="primary" className="btn" style={{ width: "100%", marginTop: 10 }} disabled={isPending}>
                        {isPending ? "Logging in..." : "Login"}
                    </Button>
                </form>
            </div>
        </div>
    );
}
