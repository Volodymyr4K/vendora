"use client";

import { useActionState } from "react";
import { superLoginAction } from "@/app/actions";

export default function SuperAdminLoginPage() {
    const [state, formAction, isPending] = useActionState(superLoginAction, null);

    return (
        <div style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
        }}>
            <div style={{
                background: "var(--paper)",
                padding: "2rem",
                borderRadius: "12px",
                boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
                width: "100%",
                maxWidth: "400px"
            }}>
                <h1 style={{
                    fontSize: "1.875rem",
                    fontWeight: "bold",
                    marginBottom: "1.5rem",
                    textAlign: "center",
                    color: "#667eea"
                }}>
                    🔐 Super Admin Login
                </h1>

                <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <div>
                        <label htmlFor="username" style={{
                            display: "block",
                            marginBottom: "0.5rem",
                            fontWeight: "500",
                            color: "var(--ink)"
                        }}>
                            Email
                        </label>
                        <input
                            id="username"
                            name="username"
                            type="email"
                            required
                            disabled={isPending}
                            style={{
                                width: "100%",
                                padding: "0.75rem",
                                border: "2px solid var(--line)",
                                borderRadius: "8px",
                                fontSize: "1rem",
                                transition: "border-color 0.2s"
                            }}
                            onFocus={(e) => e.target.style.borderColor = "#667eea"}
                            onBlur={(e) => e.target.style.borderColor = "var(--line)"}
                        />
                    </div>

                    <div>
                        <label htmlFor="password" style={{
                            display: "block",
                            marginBottom: "0.5rem",
                            fontWeight: "500",
                            color: "var(--ink)"
                        }}>
                            Password
                        </label>
                        <input
                            id="password"
                            name="password"
                            type="password"
                            required
                            disabled={isPending}
                            style={{
                                width: "100%",
                                padding: "0.75rem",
                                border: "2px solid var(--line)",
                                borderRadius: "8px",
                                fontSize: "1rem",
                                transition: "border-color 0.2s"
                            }}
                            onFocus={(e) => e.target.style.borderColor = "#667eea"}
                            onBlur={(e) => e.target.style.borderColor = "var(--line)"}
                        />
                    </div>

                    {state?.error && (
                        <div style={{
                            padding: "0.75rem",
                            background: "#fee2e2",
                            border: "1px solid #fca5a5",
                            borderRadius: "6px",
                            color: "#dc2626",
                            fontSize: "0.875rem"
                        }}>
                            ⚠️ {state.error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isPending}
                        style={{
                            width: "100%",
                            padding: "0.875rem",
                            background: isPending ? "var(--muted)" : "#667eea",
                            color: "white",
                            border: "none",
                            borderRadius: "8px",
                            fontSize: "1rem",
                            fontWeight: "600",
                            cursor: isPending ? "not-allowed" : "pointer",
                            transition: "all 0.2s",
                            marginTop: "0.5rem"
                        }}
                        onMouseOver={(e) => {
                            if (!isPending) e.currentTarget.style.background = "#5568d3";
                        }}
                        onMouseOut={(e) => {
                            if (!isPending) e.currentTarget.style.background = "#667eea";
                        }}
                    >
                        {isPending ? "Logging in..." : "Login"}
                    </button>
                </form>

                <div style={{
                    marginTop: "1.5rem",
                    padding: "1rem",
                    background: "var(--paper)",
                    borderRadius: "6px",
                    fontSize: "0.75rem",
                    color: "var(--muted)"
                }}>
                    <strong>ℹ️ Super Admin Access:</strong> This portal is for system administrators only.
                    If you manage a specific tenant/brand, please use the tenant admin panel instead.
                </div>
            </div>
        </div>
    );
}
