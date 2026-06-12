import { afterEach, describe, expect, it, vi } from "vitest";
import { monobankFetchInvoiceStatus } from "../monobank.js";

describe("monobankFetchInvoiceStatus", () => {
  const fetchMock = vi.fn();

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("calls monobank invoice/status with x-token and parses response", async () => {
    vi.stubGlobal("fetch", fetchMock);

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () =>
        JSON.stringify({
          invoiceId: "inv-123",
          status: "created",
          amount: 1234,
          finalAmount: 1234,
          ccy: 980,
          reference: "tx-1",
          createdDate: 1700000000,
          modifiedDate: 1700000100,
          cancelList: [{ amount: 100, status: "processing", createdDate: 1700000200 }],
        }),
    });

    const res = await monobankFetchInvoiceStatus({
      token: "mono-token",
      invoiceId: "inv-123",
      timeoutMs: 1000,
      retries: 0,
      backoffMs: 10,
    });

    expect(res.invoiceId).toBe("inv-123");
    expect(res.status).toBe("created");
    expect(res.amount).toBe(1234);
    expect(res.ccy).toBe(980);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.monobank.ua/api/merchant/invoice/status?invoiceId=inv-123");
    expect((init.headers as Record<string, string>)["x-token"]).toBe("mono-token");
  });

  it("throws on unexpected response shape", async () => {
    vi.stubGlobal("fetch", fetchMock);

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify({ ok: true }),
    });

    await expect(
      monobankFetchInvoiceStatus({
        token: "mono-token",
        invoiceId: "inv-123",
        timeoutMs: 1000,
        retries: 0,
        backoffMs: 10,
      })
    ).rejects.toThrow(/unexpected response shape/);
  });
});

