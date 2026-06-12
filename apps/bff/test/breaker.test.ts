import { describe, it, expect } from "vitest";
import { CircuitBreaker, BreakerOpenError } from "../src/services/breaker";

describe("CircuitBreaker", () => {
  it("opens after threshold failures and recovers via half-open", async () => {
    const b = new CircuitBreaker({
      name: "t",
      enabled: true,
      failureThreshold: 2,
      openMs: 80,
      halfOpenMax: 1,
    });

    const fail = async () => {
      throw new Error("boom");
    };

    await expect(b.exec(fail)).rejects.toThrow("boom");
    await expect(b.exec(fail)).rejects.toThrow("boom");

    await expect(b.exec(async () => 1)).rejects.toBeInstanceOf(BreakerOpenError);

    await new Promise((r) => setTimeout(r, 100));

    // half-open probe succeeds -> closes
    await expect(b.exec(async () => 42)).resolves.toBe(42);

    // next call should pass normally
    await expect(b.exec(async () => 7)).resolves.toBe(7);
  });
});