import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { liqpayFetchStatus, liqpayStatusDataAndSignature } from "../liqpay.js";

describe("liqpayFetchStatus", () => {
  const fetchMock = vi.fn();

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("posts form data to liqpay status API and parses response", async () => {
    vi.stubGlobal("fetch", fetchMock);

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () =>
        JSON.stringify({
          status: "success",
          amount: "12.34",
          currency: "UAH",
          order_id: "tx-1",
        }),
    });

    const res = await liqpayFetchStatus({
      version: 3,
      publicKey: "pub",
      privateKey: "priv",
      signatureAlgorithm: "sha1",
      transactionId: "tx-1",
      timeoutMs: 1000,
      retries: 0,
      backoffMs: 10,
    });

    expect(res.status).toBe("success");
    expect(res.currency).toBe("UAH");
    expect(res.order_id).toBe("tx-1");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://www.liqpay.ua/api/request");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["content-type"]).toContain("application/x-www-form-urlencoded");

    const body = String(init.body);
    const params = new URLSearchParams(body);
    const data = params.get("data");
    const signature = params.get("signature");
    expect(typeof data).toBe("string");
    expect(typeof signature).toBe("string");

    const expected = liqpayStatusDataAndSignature({
      version: 3,
      publicKey: "pub",
      privateKey: "priv",
      signatureAlgorithm: "sha1",
      transactionId: "tx-1",
    });
    expect(data).toBe(expected.data);
    expect(signature).toBe(expected.signature);

    // Sanity: signature matches sha1(priv+data+priv)
    const expectedSig = crypto.createHash("sha1").update(`priv${data}priv`).digest("base64");
    expect(signature).toBe(expectedSig);
  });
});

