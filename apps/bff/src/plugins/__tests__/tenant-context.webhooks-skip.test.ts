import { describe, it, expect, beforeEach, vi } from "vitest";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { tenantContextPlugin } from "../tenant-context.js";

function createMockApp(): Partial<FastifyInstance> {
  return {
    addHook: vi.fn(),
  };
}

function createMockReply(): Partial<FastifyReply> {
  const reply: any = {
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  };
  return reply;
}

describe("tenantContextPlugin - webhooks bypass", () => {
  let mockApp: Partial<FastifyInstance>;
  let onRequestHook: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;

  beforeEach(async () => {
    mockApp = createMockApp();
    await tenantContextPlugin(mockApp as FastifyInstance);

    const addHookCalls = (mockApp.addHook as any).mock.calls;
    const onRequestCall = addHookCalls.find((call: any[]) => call[0] === "onRequest");
    onRequestHook = onRequestCall[1];
  });

  it("skips tenant header requirement for /webhooks/*", async () => {
    const req: Partial<FastifyRequest> = {
      url: "/webhooks/payments/liqpay/provider123?t=token",
      headers: {},
    };
    const reply = createMockReply();

    await onRequestHook(req as FastifyRequest, reply as FastifyReply);

    expect(reply.code).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });
});

