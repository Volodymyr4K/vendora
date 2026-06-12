"use client";

import React from "react";
import { useSearchParams } from "next/navigation";

export default function LiqpayCheckoutPage() {
  const searchParams = useSearchParams();
  const data = searchParams.get("data") ?? "";
  const signature = searchParams.get("signature") ?? "";

  const formRef = React.useRef<HTMLFormElement | null>(null);

  React.useEffect(() => {
    if (!data || !signature) return;
    // Auto-submit to provider hosted checkout.
    formRef.current?.submit();
  }, [data, signature]);

  if (!data || !signature) {
    return (
      <div style={{ padding: 24, fontFamily: "sans-serif" }}>
        <h2>Payment initialization failed</h2>
        <p>Missing LiqPay parameters.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h2>Redirecting to payment…</h2>
      <p>If you are not redirected automatically, click the button below.</p>

      <form ref={formRef} action="https://www.liqpay.ua/api/3/checkout" method="POST">
        <input type="hidden" name="data" value={data} />
        <input type="hidden" name="signature" value={signature} />
        <button type="submit">Continue to LiqPay</button>
      </form>
    </div>
  );
}

