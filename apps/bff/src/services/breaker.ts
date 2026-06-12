export class BreakerOpenError extends Error {
  code = "BREAKER_OPEN" as const;
  constructor(message = "Upstream circuit breaker is OPEN") {
    super(message);
  }
}

export type BreakerState = "closed" | "open" | "half_open";

export type CircuitBreakerOptions = {
  name: string;
  enabled: boolean;
  failureThreshold: number;
  openMs: number;
  halfOpenMax: number;
};

/**
 * Minimal, production-friendly circuit breaker.
 * - CLOSED: passes requests, counts consecutive failures
 * - OPEN: short-circuits requests for openMs
 * - HALF_OPEN: allows limited probes; success closes, failure opens
 */
export class CircuitBreaker {
  private state: BreakerState = "closed";
  private consecutiveFailures = 0;
  private openedAt = 0;
  private halfOpenInFlight = 0;

  constructor(private opts: CircuitBreakerOptions) {}

  getState() {
    return this.opts.enabled ? this.state : "closed";
  }

  private open() {
    this.state = "open";
    this.openedAt = Date.now();
    this.consecutiveFailures = 0;
  }

  private close() {
    this.state = "closed";
    this.openedAt = 0;
    this.consecutiveFailures = 0;
    this.halfOpenInFlight = 0;
  }

  private halfOpen() {
    this.state = "half_open";
    this.halfOpenInFlight = 0;
    this.consecutiveFailures = 0;
  }

  async exec<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.opts.enabled) return fn();

    const now = Date.now();
    if (this.state === "open") {
      if (now - this.openedAt < this.opts.openMs) {
        throw new BreakerOpenError(`[${this.opts.name}] breaker OPEN`);
      }
      this.halfOpen();
    }

    if (this.state === "half_open") {
      if (this.halfOpenInFlight >= this.opts.halfOpenMax) {
        throw new BreakerOpenError(`[${this.opts.name}] breaker HALF_OPEN (too many probes)`);
      }
      this.halfOpenInFlight++;
    }

    try {
      const res = await fn();
      if (this.state === "half_open") this.close();
      this.consecutiveFailures = 0;
      return res;
    } catch (e) {
      if (this.state === "half_open") {
        this.open();
      } else {
        this.consecutiveFailures++;
        if (this.consecutiveFailures >= this.opts.failureThreshold) this.open();
      }
      throw e;
    } finally {
      if (this.state === "half_open") {
        this.halfOpenInFlight = Math.max(0, this.halfOpenInFlight - 1);
      }
    }
  }
}
