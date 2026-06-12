"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useThemeOptional } from "@/lib/theme/client";
import { getThemedButton } from "@/lib/components/button-registry";

export default function TenantError({
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
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "70vh",
        padding: 20,
      }}
    >
      <div className="card" style={{ maxWidth: 400, width: "100%", textAlign: "center" }}>
        <h2 style={{ marginBottom: 16 }}>Помилка завантаження</h2>
        <p className="muted" style={{ marginBottom: 24, lineHeight: 1.5 }}>
          Не вдалося завантажити налаштування. Спробуйте оновити сторінку.
        </p>
        <Button type="button" variant="primary" className="btn" onClick={() => reset()}>
          Спробувати ще раз
        </Button>
      </div>
    </div>
  );
}
