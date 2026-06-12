import { fetchJson } from "../../http.js";
import { amountDecimalFromMinor } from "./liqpay.js";

export type MollieCreatePaymentResult = {
  id: string;
  checkoutUrl: string;
};

export type MolliePayment = {
  id: string;
  status: string;
  amount: { currency: string; value: string };
  metadata?: any;
};

export type MollieRefund = {
  id: string;
  status: string;
  amount: { currency: string; value: string };
};

export type MollieChargeback = {
  id: string;
  amount: { currency: string; value: string };
};

function bearer(apiKey: string) {
  return { authorization: `Bearer ${apiKey}` };
}

function mollieBaseUrl() {
  // Security: never allow upstream base URL overrides in production runtimes.
  const isProd = (process.env.NODE_ENV || "").trim().toLowerCase() === "production";
  if (isProd) return "https://api.mollie.com";

  const env = (process.env.MOLLIE_API_BASE_URL || "").trim();
  const base = env || "https://api.mollie.com";
  return base.replace(/\/$/, "");
}

export async function mollieCreatePayment(args: {
  apiKey: string;
  idempotencyKey: string;
  amountMinor: number;
  currency: string;
  currencyExponent: number;
  description: string;
  redirectUrl: string;
  webhookUrl: string;
  metadata: Record<string, unknown>;
  timeoutMs: number;
  retries: number;
  backoffMs: number;
}): Promise<MollieCreatePaymentResult> {
  const value = amountDecimalFromMinor({ amountMinor: args.amountMinor, currencyExponent: args.currencyExponent });

  const json = await fetchJson<any>(
    `${mollieBaseUrl()}/v2/payments`,
    {
      timeoutMs: args.timeoutMs,
      retries: args.retries,
      backoffMs: args.backoffMs,
      headers: { ...bearer(args.apiKey), "idempotency-key": args.idempotencyKey },
      op: "mollie.payment.create",
    },
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        amount: { currency: args.currency.trim().toUpperCase(), value },
        description: args.description,
        redirectUrl: args.redirectUrl,
        webhookUrl: args.webhookUrl,
        metadata: args.metadata,
      }),
    }
  );

  const id = typeof json?.id === "string" ? json.id : undefined;
  const checkoutUrl = typeof json?._links?.checkout?.href === "string" ? json._links.checkout.href : undefined;
  if (!id || !checkoutUrl) throw new Error("mollie create-payment: unexpected response shape");
  return { id, checkoutUrl };
}

export async function mollieFetchPayment(args: {
  apiKey: string;
  paymentId: string;
  timeoutMs: number;
  retries: number;
  backoffMs: number;
}): Promise<MolliePayment> {
  const json = await fetchJson<any>(
    `${mollieBaseUrl()}/v2/payments/${encodeURIComponent(args.paymentId)}`,
    {
      timeoutMs: args.timeoutMs,
      retries: args.retries,
      backoffMs: args.backoffMs,
      headers: bearer(args.apiKey),
      op: "mollie.payment.get",
    }
  );

  const id = typeof json?.id === "string" ? json.id : undefined;
  const status = typeof json?.status === "string" ? json.status : undefined;
  const currency = typeof json?.amount?.currency === "string" ? json.amount.currency : undefined;
  const value = typeof json?.amount?.value === "string" ? json.amount.value : undefined;
  if (!id || !status || !currency || !value) throw new Error("mollie get-payment: unexpected response shape");
  return { id, status, amount: { currency, value }, metadata: json?.metadata };
}

export async function mollieFetchRefunds(args: {
  apiKey: string;
  paymentId: string;
  timeoutMs: number;
  retries: number;
  backoffMs: number;
}): Promise<MollieRefund[]> {
  const json = await fetchJson<any>(
    `${mollieBaseUrl()}/v2/payments/${encodeURIComponent(args.paymentId)}/refunds`,
    {
      timeoutMs: args.timeoutMs,
      retries: args.retries,
      backoffMs: args.backoffMs,
      headers: bearer(args.apiKey),
      op: "mollie.refunds.list",
    }
  );

  const items = Array.isArray(json?._embedded?.refunds) ? json._embedded.refunds : [];
  return items
    .map((r: any) => {
      const id = typeof r?.id === "string" ? r.id : undefined;
      const status = typeof r?.status === "string" ? r.status : undefined;
      const currency = typeof r?.amount?.currency === "string" ? r.amount.currency : undefined;
      const value = typeof r?.amount?.value === "string" ? r.amount.value : undefined;
      if (!id || !status || !currency || !value) return null;
      return { id, status, amount: { currency, value } } satisfies MollieRefund;
    })
    .filter(Boolean);
}

export async function mollieFetchChargebacks(args: {
  apiKey: string;
  paymentId: string;
  timeoutMs: number;
  retries: number;
  backoffMs: number;
}): Promise<MollieChargeback[]> {
  const json = await fetchJson<any>(
    `${mollieBaseUrl()}/v2/payments/${encodeURIComponent(args.paymentId)}/chargebacks`,
    {
      timeoutMs: args.timeoutMs,
      retries: args.retries,
      backoffMs: args.backoffMs,
      headers: bearer(args.apiKey),
      op: "mollie.chargebacks.list",
    }
  );

  const items = Array.isArray(json?._embedded?.chargebacks) ? json._embedded.chargebacks : [];
  return items
    .map((c: any) => {
      const id = typeof c?.id === "string" ? c.id : undefined;
      const currency = typeof c?.amount?.currency === "string" ? c.amount.currency : undefined;
      const value = typeof c?.amount?.value === "string" ? c.amount.value : undefined;
      if (!id || !currency || !value) return null;
      return { id, amount: { currency, value } } satisfies MollieChargeback;
    })
    .filter(Boolean);
}
