import { afterEach, describe, expect, it, vi } from "vitest";
import { mollieCreatePayment, mollieFetchChargebacks, mollieFetchPayment, mollieFetchRefunds } from "../mollie.js";

describe("mollie provider client", () => {
  const fetchMock = vi.fn();
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    delete process.env.MOLLIE_API_BASE_URL;
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("mollieCreatePayment calls /v2/payments with auth + idempotency and parses checkout url", async () => {
    vi.stubGlobal("fetch", fetchMock);
    process.env.MOLLIE_API_BASE_URL = "http://mollie.test";

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () =>
        JSON.stringify({
          id: "tr_123",
          _links: { checkout: { href: "https://mollie.test/checkout/tr_123" } },
        }),
    });

    const res = await mollieCreatePayment({
      apiKey: "test-api-key",
      idempotencyKey: "idem-1",
      amountMinor: 1234,
      currency: "EUR",
      currencyExponent: 2,
      description: "Payment tx-1",
      redirectUrl: "https://example.com/return",
      webhookUrl: "https://example.com/webhook",
      metadata: { transactionId: "tx-1" },
      timeoutMs: 1000,
      retries: 0,
      backoffMs: 10,
    });

    expect(res).toEqual({ id: "tr_123", checkoutUrl: "https://mollie.test/checkout/tr_123" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://mollie.test/v2/payments");
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer test-api-key");
    expect(headers["idempotency-key"]).toBe("idem-1");
    const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
    expect(body.amount).toEqual({ currency: "EUR", value: "12.34" });
    expect(body.redirectUrl).toBe("https://example.com/return");
    expect(body.webhookUrl).toBe("https://example.com/webhook");
  });

  it("ignores MOLLIE_API_BASE_URL override in production", async () => {
    vi.stubGlobal("fetch", fetchMock);
    process.env.NODE_ENV = "production";
    process.env.MOLLIE_API_BASE_URL = "http://evil.test";

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () =>
        JSON.stringify({
          id: "tr_123",
          _links: { checkout: { href: "https://mollie.test/checkout/tr_123" } },
        }),
    });

    await mollieCreatePayment({
      apiKey: "test-api-key",
      idempotencyKey: "idem-1",
      amountMinor: 1234,
      currency: "EUR",
      currencyExponent: 2,
      description: "Payment tx-1",
      redirectUrl: "https://example.com/return",
      webhookUrl: "https://example.com/webhook",
      metadata: { transactionId: "tx-1" },
      timeoutMs: 1000,
      retries: 0,
      backoffMs: 10,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.mollie.com/v2/payments");
  });

  it("mollieFetchPayment parses minimal payment fields", async () => {
    vi.stubGlobal("fetch", fetchMock);
    process.env.MOLLIE_API_BASE_URL = "http://mollie.test/";

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () =>
        JSON.stringify({
          id: "tr_123",
          status: "paid",
          amount: { currency: "EUR", value: "12.34" },
          metadata: { transactionId: "tx-1" },
        }),
    });

    const res = await mollieFetchPayment({
      apiKey: "test-api-key",
      paymentId: "tr_123",
      timeoutMs: 1000,
      retries: 0,
      backoffMs: 10,
    });

    expect(res.id).toBe("tr_123");
    expect(res.status).toBe("paid");
    expect(res.amount.currency).toBe("EUR");
    expect(res.amount.value).toBe("12.34");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    // base url trims trailing slash
    expect(url).toBe("http://mollie.test/v2/payments/tr_123");
  });

  it("mollieFetchRefunds parses embedded refunds list", async () => {
    vi.stubGlobal("fetch", fetchMock);
    process.env.MOLLIE_API_BASE_URL = "http://mollie.test";

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () =>
        JSON.stringify({
          _embedded: {
            refunds: [
              { id: "re_1", status: "refunded", amount: { currency: "EUR", value: "1.00" } },
              { id: "re_bad" }, // ignored
            ],
          },
        }),
    });

    const res = await mollieFetchRefunds({
      apiKey: "test-api-key",
      paymentId: "tr_123",
      timeoutMs: 1000,
      retries: 0,
      backoffMs: 10,
    });

    expect(res).toEqual([{ id: "re_1", status: "refunded", amount: { currency: "EUR", value: "1.00" } }]);
  });

  it("mollieFetchChargebacks parses embedded chargebacks list", async () => {
    vi.stubGlobal("fetch", fetchMock);
    process.env.MOLLIE_API_BASE_URL = "http://mollie.test";

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () =>
        JSON.stringify({
          _embedded: {
            chargebacks: [
              { id: "chb_1", amount: { currency: "EUR", value: "12.34" } },
              { id: "chb_bad" }, // ignored
            ],
          },
        }),
    });

    const res = await mollieFetchChargebacks({
      apiKey: "test-api-key",
      paymentId: "tr_123",
      timeoutMs: 1000,
      retries: 0,
      backoffMs: 10,
    });

    expect(res).toEqual([{ id: "chb_1", amount: { currency: "EUR", value: "12.34" } }]);
  });
});
