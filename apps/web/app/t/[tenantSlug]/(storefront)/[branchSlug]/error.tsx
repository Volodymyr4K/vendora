"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useThemeOptional } from "@/lib/theme/client";
import { getThemedButton } from "@/lib/components/button-registry";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams<{ tenantSlug: string }>();
  const tenantSlug = params?.tenantSlug;
  
  const theme = useThemeOptional();
  const componentSet = theme?.componentSet ?? "default";
  const Button = getThemedButton({ componentSet, tenantOverrideKey: tenantSlug ?? undefined });

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "70vh",
      padding: 20
    }}>
      <div className="card" style={{ maxWidth: 400, width: "100%", textAlign: "center" }}>
        <h2 style={{ marginBottom: 16 }}>Sorry, a technical error occurred 😔</h2>
        <p className="muted" style={{ marginBottom: 24, lineHeight: 1.5 }}>
          We are already working on a fix.
          <br />
          You can place your order by phone:
        </p>

        <a href="tel:0800330330" className="btn" style={{ display: "inline-block", width: "100%", marginBottom: 16 }}>
          0 800 330 330
        </a>

        <Button
          type="button"
          variant="primary"
          className="btn"
          onClick={() => reset()}
          style={{ background: "transparent", color: "inherit", border: "1px solid var(--line)" }}
        >
          Try again
        </Button>
      </div>
    </div>
  );
}
