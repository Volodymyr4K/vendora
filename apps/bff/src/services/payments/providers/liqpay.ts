import crypto from "node:crypto";
import { fetchJson } from "../../http.js";

export type LiqpaySignatureAlgorithm = "sha1" | "sha3-256";

export type LiqpayCheckoutInput = {
  version: number;
  publicKey: string;
  privateKey: string;
  signatureAlgorithm: LiqpaySignatureAlgorithm;

  transactionId: string;
  amountMinor: number;
  currency: string;
  currencyExponent: number;
  description: string;

  webhookUrl: string;
  resultUrl: string;
};

function shaBase64(args: { algorithm: LiqpaySignatureAlgorithm; input: string }) {
  return crypto.createHash(args.algorithm).update(args.input).digest("base64");
}

function base64Json(data: unknown) {
  return Buffer.from(JSON.stringify(data), "utf8").toString("base64");
}

export function amountDecimalFromMinor(args: { amountMinor: number; currencyExponent: number }) {
  const { amountMinor, currencyExponent } = args;
  if (!Number.isInteger(amountMinor)) throw new Error("amountMinor must be an integer");
  if (!Number.isInteger(currencyExponent) || currencyExponent < 0 || currencyExponent > 9) {
    throw new Error("currencyExponent out of range");
  }
  const factor = 10 ** currencyExponent;
  const sign = amountMinor < 0 ? "-" : "";
  const abs = Math.abs(amountMinor);
  const whole = Math.floor(abs / factor);
  const frac = abs % factor;
  if (currencyExponent === 0) return `${sign}${whole}`;
  return `${sign}${whole}.${String(frac).padStart(currencyExponent, "0")}`;
}

export function liqpayCheckoutDataAndSignature(input: LiqpayCheckoutInput) {
  const amount = amountDecimalFromMinor({ amountMinor: input.amountMinor, currencyExponent: input.currencyExponent });

  const payload = {
    version: String(input.version),
    action: "pay",
    public_key: input.publicKey,
    amount,
    currency: input.currency.trim().toUpperCase(),
    description: input.description,
    order_id: input.transactionId,
    server_url: input.webhookUrl,
    result_url: input.resultUrl,
  };

  const data = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  const signature = shaBase64({
    algorithm: input.signatureAlgorithm,
    input: `${input.privateKey}${data}${input.privateKey}`,
  });

  return { data, signature };
}

export type LiqpayStatusInput = {
  version: number;
  publicKey: string;
  privateKey: string;
  signatureAlgorithm: LiqpaySignatureAlgorithm;
  transactionId: string;
};

export function liqpayStatusDataAndSignature(input: LiqpayStatusInput) {
  const payload = {
    version: String(input.version),
    action: "status",
    public_key: input.publicKey,
    order_id: input.transactionId,
  };
  const data = base64Json(payload);
  const signature = shaBase64({
    algorithm: input.signatureAlgorithm,
    input: `${input.privateKey}${data}${input.privateKey}`,
  });
  return { data, signature };
}

export type LiqpayStatusResponse = {
  status: string;
  amount: string | number;
  currency: string;
  order_id: string;
};

function liqpayBaseUrl() {
  // Security: never allow upstream base URL overrides in production runtimes.
  const isProd = (process.env.NODE_ENV || "").trim().toLowerCase() === "production";
  if (isProd) return "https://www.liqpay.ua";

  const env = (process.env.LIQPAY_API_BASE_URL || "").trim();
  const base = env || "https://www.liqpay.ua";
  return base.replace(/\/$/, "");
}

export async function liqpayFetchStatus(args: {
  version: number;
  publicKey: string;
  privateKey: string;
  signatureAlgorithm: LiqpaySignatureAlgorithm;
  transactionId: string;
  timeoutMs: number;
  retries: number;
  backoffMs: number;
}): Promise<LiqpayStatusResponse> {
  const { data, signature } = liqpayStatusDataAndSignature({
    version: args.version,
    publicKey: args.publicKey,
    privateKey: args.privateKey,
    signatureAlgorithm: args.signatureAlgorithm,
    transactionId: args.transactionId,
  });

  const form = new URLSearchParams();
  form.set("data", data);
  form.set("signature", signature);

  const json = await fetchJson<any>(
    `${liqpayBaseUrl()}/api/request`,
    { timeoutMs: args.timeoutMs, retries: args.retries, backoffMs: args.backoffMs, op: "liqpay.status" },
    { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form.toString() }
  );

  const status = typeof json?.status === "string" ? json.status : undefined;
  const amount = typeof json?.amount === "string" || typeof json?.amount === "number" ? json.amount : undefined;
  const currency = typeof json?.currency === "string" ? json.currency : undefined;
  const order_id = typeof json?.order_id === "string" ? json.order_id : undefined;
  if (!status || amount === undefined || !currency || !order_id) {
    throw new Error("liqpay status: unexpected response shape");
  }
  return { status, amount, currency, order_id };
}
