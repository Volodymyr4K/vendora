import { fetchJson } from "../../http.js";

export type MonobankCreateInvoiceResult = {
  invoiceId: string;
  pageUrl: string;
};

export type MonobankInvoiceCancel = {
  amount: number;
  status: string;
  createdDate?: number;
  modifiedDate?: number;
};

export type MonobankInvoiceStatus = {
  invoiceId: string;
  status: string;
  amount: number;
  finalAmount?: number;
  ccy: number;
  reference?: string;
  createdDate?: number;
  modifiedDate?: number;
  cancelList?: MonobankInvoiceCancel[];
};

function monobankBaseUrl() {
  // Security: never allow upstream base URL overrides in production runtimes.
  const isProd = (process.env.NODE_ENV || "").trim().toLowerCase() === "production";
  if (isProd) return "https://api.monobank.ua";

  const env = (process.env.MONOBANK_API_BASE_URL || "").trim();
  const base = env || "https://api.monobank.ua";
  return base.replace(/\/$/, "");
}

export async function monobankFetchPubkeyPem(args: {
  token: string;
  timeoutMs: number;
  retries: number;
  backoffMs: number;
}): Promise<string> {
  const json = await fetchJson<any>(
    `${monobankBaseUrl()}/api/merchant/pubkey`,
    { timeoutMs: args.timeoutMs, retries: args.retries, backoffMs: args.backoffMs, headers: { "x-token": args.token }, op: "monobank.pubkey" },
  );
  if (typeof json === "string" && json.trim().length > 0) return json.trim();
  if (typeof json?.key === "string" && json.key.trim().length > 0) return json.key.trim();
  throw new Error("monobank pubkey: unexpected response shape");
}

export async function monobankFetchInvoiceStatus(args: {
  token: string;
  invoiceId: string;
  timeoutMs: number;
  retries: number;
  backoffMs: number;
}): Promise<MonobankInvoiceStatus> {
  const url = `${monobankBaseUrl()}/api/merchant/invoice/status?invoiceId=${encodeURIComponent(args.invoiceId)}`;
  const json = await fetchJson<any>(
    url,
    {
      timeoutMs: args.timeoutMs,
      retries: args.retries,
      backoffMs: args.backoffMs,
      headers: { "x-token": args.token },
      op: "monobank.invoice.status",
    }
  );

  const invoiceId = typeof json?.invoiceId === "string" ? json.invoiceId : undefined;
  const status = typeof json?.status === "string" ? json.status : undefined;
  const amount = typeof json?.amount === "number" ? json.amount : undefined;
  const ccy = typeof json?.ccy === "number" ? json.ccy : undefined;
  if (!invoiceId || !status || amount === undefined || ccy === undefined) {
    throw new Error("monobank invoice.status: unexpected response shape");
  }

  const finalAmount = typeof json?.finalAmount === "number" ? json.finalAmount : undefined;
  const reference = typeof json?.reference === "string" ? json.reference : undefined;
  const createdDate = typeof json?.createdDate === "number" ? json.createdDate : undefined;
  const modifiedDate = typeof json?.modifiedDate === "number" ? json.modifiedDate : undefined;

  const cancelList: MonobankInvoiceCancel[] | undefined = Array.isArray(json?.cancelList)
    ? json.cancelList
        .map((c: any) => {
          if (typeof c?.amount !== "number" || typeof c?.status !== "string") return null;
          return {
            amount: c.amount,
            status: c.status,
            createdDate: typeof c?.createdDate === "number" ? c.createdDate : undefined,
            modifiedDate: typeof c?.modifiedDate === "number" ? c.modifiedDate : undefined,
          };
        })
        .filter(Boolean)
    : undefined;

  return { invoiceId, status, amount, finalAmount, ccy, reference, createdDate, modifiedDate, cancelList };
}

export function iso4217NumericFromAlpha(currency: string): number | null {
  const c = currency.trim().toUpperCase();
  if (c === "UAH") return 980;
  if (c === "EUR") return 978;
  if (c === "USD") return 840;
  if (c === "PLN") return 985;
  if (c === "GBP") return 826;
  return null;
}

export async function monobankCreateInvoice(args: {
  token: string;
  amountMinor: number;
  currencyAlpha: string;
  transactionId: string;
  webhookUrl: string;
  redirectUrl: string;
  destination?: string | undefined;
  timeoutMs: number;
  retries: number;
  backoffMs: number;
}): Promise<MonobankCreateInvoiceResult> {
  const ccy = iso4217NumericFromAlpha(args.currencyAlpha);
  if (ccy === null) {
    throw new Error(`Unsupported currency for monobank: ${args.currencyAlpha}`);
  }

  const body = {
    amount: args.amountMinor,
    ccy,
    merchantPaymInfo: {
      reference: args.transactionId,
      destination: args.destination ?? `Payment ${args.transactionId}`,
    },
    redirectUrl: args.redirectUrl,
    webHookUrl: args.webhookUrl,
  };

  const json = await fetchJson<any>(
    `${monobankBaseUrl()}/api/merchant/invoice/create`,
    {
      timeoutMs: args.timeoutMs,
      retries: args.retries,
      backoffMs: args.backoffMs,
      headers: { "x-token": args.token },
      op: "monobank.invoice.create",
    },
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  const invoiceId = typeof json?.invoiceId === "string" ? json.invoiceId : undefined;
  const pageUrl = typeof json?.pageUrl === "string" ? json.pageUrl : undefined;
  if (!invoiceId || !pageUrl) {
    throw new Error("monobank invoice.create: unexpected response shape");
  }

  return { invoiceId, pageUrl };
}
