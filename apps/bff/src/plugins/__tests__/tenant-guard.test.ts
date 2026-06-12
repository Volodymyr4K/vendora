/**
 * JWT-Header Tenant Validation Tests
 * 
 * Comprehensive test suite for Phase 3: JWT-Header Tenant Validation
 * 
 * Tests verify that:
 * 1. JWT tenantId is validation-only (NOT source of truth)
 * 2. req.tenant.id (from header) is the single source of truth
 * 3. JWT mismatch returns 403 FORBIDDEN
 * 4. Confused deputy attacks are prevented
 * 5. Security logging occurs on mismatch
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { tenantGuardPlugin } from '../tenant-guard.js';

// Mock tenant IDs for testing
const TENANT_A_ID = '00000000-0000-0000-0000-000000000001';
const TENANT_B_ID = '00000000-0000-0000-0000-000000000002';

/**
 * Helper to create mock Fastify request
 */
function createMockRequest(options: {
    tenant?: { id: string; name: string; slug: string; isActive: boolean };
    user?: { tenantId: string; userId: string; role: string };
}): Partial<FastifyRequest> {
    return {
        tenant: options.tenant as any,
        user: options.user as any,
        headers: {},
        url: '/test-route',
    };
}

/**
 * Helper to create mock Fastify reply
 */
function createMockReply(): Partial<FastifyReply> {
    const reply: any = {
        code: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis(),
        status: vi.fn().mockReturnThis(),
    };
    return reply;
}

/**
 * Helper to create mock Fastify app
 */
function createMockApp(): Partial<FastifyInstance> {
    return {
        log: {
            warn: vi.fn(),
            error: vi.fn(),
            info: vi.fn(),
            debug: vi.fn(),
        } as any,
        addHook: vi.fn(),
    };
}

describe('JWT-Header Tenant Validation - Phase 3', () => {
    describe('tenant-guard Plugin', () => {
        let mockApp: Partial<FastifyInstance>;
        let onRequestHook: Function;

        beforeEach(async () => {
            mockApp = createMockApp();

            // Register plugin and capture the onRequest hook
            await tenantGuardPlugin(mockApp as FastifyInstance, {} as any);

            // Extract the hook function
            const addHookCalls = (mockApp.addHook as any).mock.calls;
            const onRequestCall = addHookCalls.find((call: any[]) => call[0] === 'onRequest');
            onRequestHook = onRequestCall[1];
        });

        it('should allow valid JWT with matching tenantId', async () => {
            const req = createMockRequest({
                tenant: {
                    id: TENANT_A_ID,
                    name: 'Tenant A',
                    slug: 'tenant-a',
                    isActive: true
                },
                user: {
                    tenantId: TENANT_A_ID,
                    userId: 'user-123',
                    role: 'admin'
                }
            });
            const reply = createMockReply();

            await onRequestHook(req, reply);

            // Should not send any error response
            expect(reply.code).not.toHaveBeenCalled();
            expect(reply.send).not.toHaveBeenCalled();
        });

        it('should reject JWT with mismatched tenantId (confused deputy prevention)', async () => {
            const req = createMockRequest({
                tenant: {
                    id: TENANT_B_ID,  // Header says Tenant B
                    name: 'Tenant B',
                    slug: 'tenant-b',
                    isActive: true
                },
                user: {
                    tenantId: TENANT_A_ID,  // JWT says Tenant A - MISMATCH!
                    userId: 'user-123',
                    role: 'admin'
                }
            });
            const reply = createMockReply();

            await onRequestHook(req, reply);

            // Should return 403 FORBIDDEN
            expect(reply.code).toHaveBeenCalledWith(403);
            expect(reply.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: 'Tenant mismatch',
                    code: 'FORBIDDEN'
                })
            );
        });

        it('should log security warning on tenant mismatch', async () => {
            const mockReqLog = {
                warn: vi.fn(),
                error: vi.fn(),
                info: vi.fn(),
                debug: vi.fn()
            };

            const req = createMockRequest({
                tenant: {
                    id: TENANT_B_ID,
                    name: 'Tenant B',
                    slug: 'tenant-b',
                    isActive: true
                },
                user: {
                    tenantId: TENANT_A_ID,
                    userId: 'user-123',
                    role: 'admin'
                }
            });
            (req as any).log = mockReqLog; // Attach logger to request
            const reply = createMockReply();

            await onRequestHook(req, reply);

            // Verify security logging on req.log (not app.log)
            expect(mockReqLog.warn).toHaveBeenCalledWith(
                expect.objectContaining({
                    jwtTenantId: TENANT_A_ID,
                    headerTenantId: TENANT_B_ID,
                    userId: 'user-123'
                }),
                expect.stringContaining('mismatch')
            );
        });

        it('should reject request with missing JWT tenantId', async () => {
            const req = createMockRequest({
                tenant: {
                    id: TENANT_A_ID,
                    name: 'Tenant A',
                    slug: 'tenant-a',
                    isActive: true
                },
                user: {
                    userId: 'user-123',
                    role: 'admin'
                } as any  // Missing tenantId
            });
            const reply = createMockReply();

            await onRequestHook(req, reply);

            // Should return 403 INVALID_JWT
            expect(reply.code).toHaveBeenCalledWith(403);
            expect(reply.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: 'JWT missing tenantId',
                    code: 'INVALID_JWT'
                })
            );
        });

        it('should reject request with missing user (no JWT)', async () => {
            const req = createMockRequest({
                tenant: {
                    id: TENANT_A_ID,
                    name: 'Tenant A',
                    slug: 'tenant-a',
                    isActive: true
                }
                // user is undefined - no JWT
            });
            const reply = createMockReply();

            await onRequestHook(req, reply);

            // Should return 403 INVALID_JWT
            expect(reply.code).toHaveBeenCalledWith(403);
            expect(reply.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: 'JWT missing tenantId',
                    code: 'INVALID_JWT'
                })
            );
        });

        it('should reject request with missing tenant context (no header)', async () => {
            const req = createMockRequest({
                // tenant is undefined - no x-tenant-slug header
                user: {
                    tenantId: TENANT_A_ID,
                    userId: 'user-123',
                    role: 'admin'
                }
            });
            const reply = createMockReply();

            await onRequestHook(req, reply);

            // Should return 400 MISSING_TENANT_CONTEXT
            expect(reply.code).toHaveBeenCalledWith(400);
            expect(reply.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: 'Tenant context required',
                    code: 'MISSING_TENANT_CONTEXT'
                })
            );
        });

        it('should block inactive tenant even with valid JWT', async () => {
            const req = createMockRequest({
                tenant: {
                    id: TENANT_A_ID,
                    name: 'Tenant A',
                    slug: 'tenant-a',
                    isActive: false  // INACTIVE!
                },
                user: {
                    tenantId: TENANT_A_ID,  // JWT matches
                    userId: 'user-123',
                    role: 'admin'
                }
            });
            const reply = createMockReply();

            await onRequestHook(req, reply);

            // Should return 403 for inactive tenant
            expect(reply.code).toHaveBeenCalledWith(403);
            expect(reply.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: 'Subscription suspended'
                })
            );
        });

        it('should log warning when blocking inactive tenant', async () => {
            const mockReqLog = {
                warn: vi.fn(),
                error: vi.fn(),
                info: vi.fn(),
                debug: vi.fn()
            };

            const req = createMockRequest({
                tenant: {
                    id: TENANT_A_ID,
                    name: 'Tenant A',
                    slug: 'tenant-a',
                    isActive: false
                },
                user: {
                    tenantId: TENANT_A_ID,
                    userId: 'user-123',
                    role: 'admin'
                }
            });
            (req as any).log = mockReqLog; // Attach logger to request
            const reply = createMockReply();

            await onRequestHook(req, reply);

            // Verify logging for blocked inactive tenant on req.log
            expect(mockReqLog.warn).toHaveBeenCalledWith(
                expect.objectContaining({
                    tenantId: TENANT_A_ID,
                    tenantName: 'Tenant A'
                }),
                expect.stringContaining('inactive')
            );
        });
    });

    describe('Single Source of Truth Enforcement', () => {
        it('should use req.tenant.id as source of truth (NOT user.tenantId)', async () => {
            // This test documents the architectural decision:
            // req.tenant.id (from x-tenant-slug header) is the ONLY source of truth
            // user.tenantId (from JWT) is VALIDATION ONLY

            const tenantFromHeader = TENANT_B_ID;  // Header says Tenant B
            const tenantFromJWT = TENANT_A_ID;     // JWT says Tenant A

            const req = createMockRequest({
                tenant: {
                    id: tenantFromHeader,  // SOURCE OF TRUTH
                    name: 'Tenant B',
                    slug: 'tenant-b',
                    isActive: true
                },
                user: {
                    tenantId: tenantFromJWT,  // VALIDATION ONLY
                    userId: 'user-123',
                    role: 'admin'
                }
            });
            const reply = createMockReply();
            const mockApp = createMockApp();

            const plugin = tenantGuardPlugin(mockApp as FastifyInstance, {} as any);
            const hook = (mockApp.addHook as any).mock.calls[0][1];

            await hook(req, reply);

            // Since they don't match, should REJECT using header as truth
            expect(reply.code).toHaveBeenCalledWith(403);

            // Verify error message references the MISMATCH
            expect(reply.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    code: 'FORBIDDEN'
                })
            );
        });
    });

    describe('Confused Deputy Attack Prevention', () => {
        it('should prevent user from Tenant A accessing Tenant B via subdomain manipulation', async () => {
            // Attack scenario:
            // 1. User logs in to tenant-a.app.com (gets JWT with tenantId: A)
            // 2. User changes URL to tenant-b.app.com (header now says Tenant B)
            // 3. Tries to access /admin routes with Tenant A JWT
            // 4. System should REJECT (403 FORBIDDEN)

            const mockReqLog = {
                warn: vi.fn(),
                error: vi.fn(),
                info: vi.fn(),
                debug: vi.fn()
            };

            const req = createMockRequest({
                tenant: {
                    id: TENANT_B_ID,  // Attacker visited tenant-b.app.com
                    name: 'Tenant B (Target)',
                    slug: 'tenant-b',
                    isActive: true
                },
                user: {
                    tenantId: TENANT_A_ID,  // But JWT is from Tenant A
                    userId: 'attacker-user',
                    role: 'admin'
                }
            });
            (req as any).log = mockReqLog; // Attach logger to request
            const reply = createMockReply();
            const mockApp = createMockApp();

            const plugin = tenantGuardPlugin(mockApp as FastifyInstance, {} as any);
            const hook = (mockApp.addHook as any).mock.calls[0][1];

            await hook(req, reply);

            // Attack prevented
            expect(reply.code).toHaveBeenCalledWith(403);
            expect(reply.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: 'Tenant mismatch',
                    code: 'FORBIDDEN'
                })
            );

            // Security event logged on req.log
            expect(mockReqLog.warn).toHaveBeenCalledWith(
                expect.objectContaining({
                    jwtTenantId: TENANT_A_ID,
                    headerTenantId: TENANT_B_ID,
                    userId: 'attacker-user'
                }),
                expect.any(String)
            );
        });

        it('should prevent privilege escalation via JWT forgery attempt', async () => {
            // Attack scenario:
            // Attacker tries to forge JWT with different tenantId
            // System validates JWT signature first (not tested here)
            // Then validates tenantId matches header

            const req = createMockRequest({
                tenant: {
                    id: TENANT_A_ID,
                    name: 'Tenant A',
                    slug: 'tenant-a',
                    isActive: true
                },
                user: {
                    tenantId: TENANT_B_ID,  // Forged to access Tenant B's data
                    userId: 'attacker-user',
                    role: 'super-admin'  // Even with elevated role
                }
            });
            const reply = createMockReply();
            const mockApp = createMockApp();

            const plugin = tenantGuardPlugin(mockApp as FastifyInstance, {} as any);
            const hook = (mockApp.addHook as any).mock.calls[0][1];

            await hook(req, reply);

            // Privilege escalation prevented
            expect(reply.code).toHaveBeenCalledWith(403);
            expect(reply.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    code: 'FORBIDDEN'
                })
            );
        });
    });

    describe('Error Code Validation', () => {
        it('should return correct HTTP status codes for each error type', async () => {
            const mockApp = createMockApp();
            const plugin = tenantGuardPlugin(mockApp as FastifyInstance, {} as any);
            const hook = (mockApp.addHook as any).mock.calls[0][1];

            // 400 Bad Request - Missing tenant context
            const req1 = createMockRequest({
                user: { tenantId: TENANT_A_ID, userId: '1', role: 'admin' }
            });
            const reply1 = createMockReply();
            await hook(req1, reply1);
            expect(reply1.code).toHaveBeenCalledWith(400);

            // 403 Forbidden - JWT missing tenantId
            const req2 = createMockRequest({
                tenant: { id: TENANT_A_ID, name: 'A', slug: 'a', isActive: true },
                user: { userId: '1', role: 'admin' } as any
            });
            const reply2 = createMockReply();
            await hook(req2, reply2);
            expect(reply2.code).toHaveBeenCalledWith(403);

            // 403 Forbidden - Tenant mismatch
            const req3 = createMockRequest({
                tenant: { id: TENANT_A_ID, name: 'A', slug: 'a', isActive: true },
                user: { tenantId: TENANT_B_ID, userId: '1', role: 'admin' }
            });
            const reply3 = createMockReply();
            await hook(req3, reply3);
            expect(reply3.code).toHaveBeenCalledWith(403);

            // 403 Forbidden - Inactive tenant
            const req4 = createMockRequest({
                tenant: { id: TENANT_A_ID, name: 'A', slug: 'a', isActive: false },
                user: { tenantId: TENANT_A_ID, userId: '1', role: 'admin' }
            });
            const reply4 = createMockReply();
            await hook(req4, reply4);
            expect(reply4.code).toHaveBeenCalledWith(403);
        });
    });

    describe('Regression Tests - Phase 3 Fixes', () => {
        it('should prevent the original confused deputy vulnerability', async () => {
            // Original vulnerability (before Phase 3):
            // - JWT tenantId was used directly for DB queries
            // - Header tenantId was ignored after initial resolution
            // - User could query wrong tenant's data

            // After Phase 3:
            // - req.tenant.id (from header) is source of truth
            // - JWT tenantId validated against req.tenant.id
            // - Mismatch = 403

            const req = createMockRequest({
                tenant: {
                    id: TENANT_B_ID,  // Header/subdomain says Tenant B
                    name: 'Victim Tenant',
                    slug: 'victim',
                    isActive: true
                },
                user: {
                    tenantId: TENANT_A_ID,  // JWT from Tenant A
                    userId: 'attacker',
                    role: 'admin'
                }
            });
            const reply = createMockReply();
            const mockApp = createMockApp();

            const plugin = tenantGuardPlugin(mockApp as FastifyInstance, {} as any);
            const hook = (mockApp.addHook as any).mock.calls[0][1];

            await hook(req, reply);

            // Vulnerability fixed - request blocked
            expect(reply.code).toHaveBeenCalledWith(403);
            expect(reply.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: 'Tenant mismatch',
                    code: 'FORBIDDEN'
                })
            );
        });
    });
});
