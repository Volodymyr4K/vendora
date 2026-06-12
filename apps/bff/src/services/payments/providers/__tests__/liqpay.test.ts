import { describe, expect, it } from "vitest";
import { amountDecimalFromMinor, liqpayCheckoutDataAndSignature } from "../liqpay.js";

describe("liqpay", () => {
  it("amountDecimalFromMinor formats correctly", () => {
    expect(amountDecimalFromMinor({ amountMinor: 1234, currencyExponent: 2 })).toBe("12.34");
    expect(amountDecimalFromMinor({ amountMinor: 0, currencyExponent: 2 })).toBe("0.00");
    expect(amountDecimalFromMinor({ amountMinor: 5, currencyExponent: 0 })).toBe("5");
  });

  it("liqpayCheckoutDataAndSignature returns stable base64 fields", () => {
    const res = liqpayCheckoutDataAndSignature({
      version: 3,
      publicKey: "pub",
      privateKey: "priv",
      signatureAlgorithm: "sha1",
      transactionId: "tx-1",
      amountMinor: 1234,
      currency: "UAH",
      currencyExponent: 2,
      description: "Payment",
      webhookUrl: "https://example.com/webhook",
      resultUrl: "https://example.com/return",
    });

    expect(typeof res.data).toBe("string");
    expect(typeof res.signature).toBe("string");
    // Determinism: same inputs -> same outputs
    const res2 = liqpayCheckoutDataAndSignature({
      version: 3,
      publicKey: "pub",
      privateKey: "priv",
      signatureAlgorithm: "sha1",
      transactionId: "tx-1",
      amountMinor: 1234,
      currency: "UAH",
      currencyExponent: 2,
      description: "Payment",
      webhookUrl: "https://example.com/webhook",
      resultUrl: "https://example.com/return",
    });
    expect(res2).toEqual(res);
  });
});
