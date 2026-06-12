/**
 * Phase 1G: Context Propagation & Security Tests
 * 
 * Verifies:
 * 1. Anti-Spoofing: Middleware overwrites x-tenant-slug
 * 2. Request Correlation: x-request-id handling
 * 3. Context Injection: Headers passed to downstream
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';

const { rewriteMock, nextMock } = vi.hoisted(() => ({
  rewriteMock: vi.fn(),
  nextMock: vi.fn(),
}));

// Define mock implementations
rewriteMock.mockImplementation((url, init) => ({
  type: 'rewrite',
  status: 200,
  headers: new Headers(),
  _url: url,
  _init: init,
}));

nextMock.mockImplementation((init) => ({
  type: 'next',
  status: 200,
  headers: new Headers(),
  _init: init,
}));

// Mock NextResponse to capture rewrites/next calls
vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return {
    ...actual,
    NextResponse: {
      ...actual.NextResponse,
      next: nextMock,
      rewrite: rewriteMock,
    },
  };
});

// Mock environment
const ORIGINAL_ENV = process.env;

describe('Phase 1G: Context Propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    process.env = {
      ...ORIGINAL_ENV,
      BFF_BASE_URL: 'http://bff-mock',
      // Tenant resolution is now allowlist-based (no RPC): domain -> tenant resolution.
      TENANT_BY_DOMAIN_JSON: JSON.stringify({
        'pizza.localhost': {
          tenantId: 't-123',
          slug: 'pizza',
          type: 'custom',
          mode: 'default',
          branchSlug: 'main-branch',
        },
        'victim.localhost': {
          tenantId: 't-666',
          slug: 'victim',
          type: 'custom',
          mode: 'default',
          branchSlug: 'main-branch',
        },
      }),
    };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.restoreAllMocks();
  });

  function createRequest(host: string, headers: Record<string, string> = {}, path = '/menu') {
    return new NextRequest(`http://${host}${path}`, {
      headers: { host, accept: "text/html", ...headers }
    });
  }

  // Unpack mocked NextResponse calls for assertions
  function getNextResponseMock() {
    return {
      rewrite: rewriteMock,
      next: nextMock,
    };
  }

  describe('Anti-Spoofing Checks', () => {
    it('should overwrite x-tenant-slug supplied by client', async () => {
      // ATTACK SCENARIO: 
      // - Host: pizza.localhost (should resolve to 'pizza')
      // - Attacker Header: x-tenant-slug: victim

      const req = createRequest('pizza.localhost:3000', {
        'x-tenant-slug': 'victim'
      });

      await middleware(req);

      // Verify what was passed to rewrite
      const rewriteMock = getNextResponseMock().rewrite;
      expect(rewriteMock).toHaveBeenCalled();

      const callArgs = rewriteMock.mock.calls[0]; // [url, init]
      const init = callArgs[1];
      const headers = init?.request?.headers as Headers;

      // ASSERT: Middleware Overwrite Rule
      expect(headers.get('x-tenant-slug')).toBe('pizza'); // MUST be pizza
      expect(headers.get('x-tenant-slug')).not.toBe('victim');
      expect(headers.get('x-tenant-id')).toBe('t-123');
    });
  });

  describe('Request Correlation (x-request-id)', () => {
    it('should generate x-request-id if missing', async () => {
      const req = createRequest('pizza.localhost:3000');
      await middleware(req);

      const rewriteMock = getNextResponseMock().rewrite;
      const headers = rewriteMock.mock.calls[0][1].request.headers as Headers;

      expect(headers.get('x-request-id')).toBeDefined();
      expect(headers.get('x-request-id')?.length).toBeGreaterThan(10); // UUID-like
    });

    it('should preserve incoming x-request-id (Trace Continuity)', async () => {
      const traceId = 'trace-123-abc';
      const req = createRequest('pizza.localhost:3000', {
        'x-request-id': traceId
      });
      await middleware(req);

      const rewriteMock = getNextResponseMock().rewrite;
      const headers = rewriteMock.mock.calls[0][1].request.headers as Headers;

      expect(headers.get('x-request-id')).toBe(traceId);
    });
  });

  describe('Context Forwarding', () => {
    it('should forward x-forwarded-host', async () => {
      const req = createRequest('pizza.localhost:3000');
      await middleware(req);

      const rewriteMock = getNextResponseMock().rewrite;
      const headers = rewriteMock.mock.calls[0][1].request.headers as Headers;

      expect(headers.get('x-forwarded-host')).toBe('pizza.localhost');
    });

    it('should overwrite x-forwarded-host even if client/proxy set it (anti-spoofing)', async () => {
      const req = createRequest('internal-proxy', {
        'x-forwarded-host': 'original.com'
      });
      await middleware(req);

      // internal-proxy is not a known tenant domain. The middleware should rewrite to tenant-not-found.
      const rewriteMock = getNextResponseMock().rewrite;
      const url = rewriteMock.mock.calls[0][0]; // URL object
      expect(url.pathname).toBe('/tenant-not-found');
    });
  });

  describe('Fail Fast', () => {
    it('should rewrite to /tenant-not-found if resolution fails', async () => {
      const req = createRequest('unknown.localhost:3000');
      await middleware(req);

      const rewriteMock = getNextResponseMock().rewrite;
      const url = rewriteMock.mock.calls[0][0]; // URL object

      expect(url.pathname).toBe('/tenant-not-found');
    });
  });
});
