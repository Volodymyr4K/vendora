/**
 * Test timezone validation in tenant schemas
 */

import { describe, it, expect } from 'vitest';
import { TenantCreateSchema, TenantUpdateSchema } from '../tenants.schema.js';

describe('Tenant Schema Timezone Validation', () => {
    describe('TenantCreateSchema', () => {
        it('should accept valid IANA timezone', () => {
            const result = TenantCreateSchema.safeParse({
                name: 'Test Tenant',
                slug: 'test-tenant',
                adminEmail: 'admin@test.com',
                adminPassword: 'test123',
                countryCode: 'UA',
                currency: 'UAH',
                timezone: 'Europe/Kiev',
            });

            expect(result.success).toBe(true);
        });

        it('should accept America/New_York timezone', () => {
            const result = TenantCreateSchema.safeParse({
                name: 'Test Tenant',
                slug: 'test-tenant',
                adminEmail: 'admin@test.com',
                adminPassword: 'test123',
                countryCode: 'US',
                currency: 'USD',
                timezone: 'America/New_York',
            });

            expect(result.success).toBe(true);
        });


        it('should reject empty string timezone', () => {
            const result = TenantCreateSchema.safeParse({
                name: 'Test Tenant',
                slug: 'test-tenant',
                adminEmail: 'admin@test.com',
                adminPassword: 'test123',
                countryCode: 'UA',
                currency: 'UAH',
                timezone: '',
            });

            expect(result.success).toBe(false);
        });

        it('should use default timezone if not provided', () => {
            const result = TenantCreateSchema.safeParse({
                name: 'Test Tenant',
                slug: 'test-tenant',
                adminEmail: 'admin@test.com',
                adminPassword: 'test123',
                countryCode: 'UA',
                currency: 'UAH',
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.timezone).toBe('Europe/Kiev');
            }
        });
    });

    describe('TenantUpdateSchema', () => {
        it('should accept valid IANA timezone', () => {
            const result = TenantUpdateSchema.safeParse({
                timezone: 'Europe/Berlin',
            });

            expect(result.success).toBe(true);
        });


        it('should accept undefined timezone (optional field)', () => {
            const result = TenantUpdateSchema.safeParse({
                name: 'Updated Name',
            });

            expect(result.success).toBe(true);
        });

        it('should accept empty update object', () => {
            const result = TenantUpdateSchema.safeParse({});

            expect(result.success).toBe(true);
        });

        it('should accept valid capabilities (Phase 1.2)', () => {
            const result = TenantUpdateSchema.safeParse({
                features: { capabilities: ['inventory', 'nutrition'] },
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.features?.capabilities).toEqual(['inventory', 'nutrition']);
            }
        });

        it('should reject unknown capability key (Phase 1.2)', () => {
            const result = TenantUpdateSchema.safeParse({
                features: { capabilities: ['inventory', 'typo-key'] },
            });

            expect(result.success).toBe(false);
        });

        it('should accept valid adminModules keys (ACCESS_LEVELS Phase 4.1)', () => {
            const result = TenantUpdateSchema.safeParse({
                features: { adminModules: { admin_dashboard: true, admin_orders: false } },
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.features?.adminModules).toEqual({ admin_dashboard: true, admin_orders: false });
            }
        });

        it('should reject invalid adminModules key (ACCESS_LEVELS Phase 4.1 — canonical list only)', () => {
            const result = TenantUpdateSchema.safeParse({
                features: { adminModules: { admin_dashboard: true, unknown_module: true } },
            });

            expect(result.success).toBe(false);
        });

        it('should accept adminModules with false stored (map, not set — false is valid)', () => {
            const result = TenantUpdateSchema.safeParse({
                features: { adminModules: { admin_dashboard: false, admin_orders: false } },
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.features?.adminModules).toEqual({ admin_dashboard: false, admin_orders: false });
            }
        });

        it('should accept adminModules empty object (backward compat)', () => {
            const result = TenantUpdateSchema.safeParse({
                features: { adminModules: {} },
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.features?.adminModules).toEqual({});
            }
        });

        it('should accept features without adminModules (field optional)', () => {
            const result = TenantUpdateSchema.safeParse({
                features: { version: 1 },
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.features?.adminModules).toBeUndefined();
            }
        });
    });
});
