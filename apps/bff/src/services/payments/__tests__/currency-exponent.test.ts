import { describe, expect, it } from "vitest";
import { currencyExponentFromIso } from "../currency-exponent.js";

describe("currency-exponent", () => {
  it("returns exponent for known currency", () => {
    expect(currencyExponentFromIso("UAH")).toBe(2);
    expect(currencyExponentFromIso("jpy")).toBe(0);
    expect(currencyExponentFromIso(" KWD ")).toBe(3);
  });

  it("returns null for unknown currency", () => {
    expect(currencyExponentFromIso("XXX")).toBeNull();
  });
});

