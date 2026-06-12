import { describe, it, expect } from 'vitest';
import {
    zOrderPaidEvent,
    zOrderStatusChangedEvent,
    zAppError,
    zThemeV1,
    zResolvedTheme,
} from '@vendora/contracts';
import crypto from 'node:crypto';

describe('Contracts Smoke Test', () => {

    describe('Events', () => {
        it('should validate a valid OrderPaidEvent', () => {
            const payload = {
                eventId: crypto.randomUUID(),
                occurredAt: new Date().toISOString(),
                eventType: 'order.paid',
                orderId: 'order-123',
                tenantId: 'tenant-abc',
                amount: 1000,
                token: 'tok_123'
            };

            const result = zOrderPaidEvent.safeParse(payload);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.eventType).toBe('order.paid');
            }
        });

        it('should validate a valid OrderStatusChangedEvent', () => {
            const payload = {
                eventId: crypto.randomUUID(),
                occurredAt: new Date().toISOString(),
                eventType: 'order.status_updated',
                orderId: 'order-123',
                tenantId: 'tenant-abc',
                oldStatus: 'pending',
                newStatus: 'cooking'
            };

            const result = zOrderStatusChangedEvent.safeParse(payload);
            expect(result.success).toBe(true);
        });

        it('should fail on missing required fields', () => {
            const payload = {
                eventId: crypto.randomUUID(),
                // missing occurredAt
                eventType: 'order.paid',
                orderId: 'order-123'
            };

            const result = zOrderPaidEvent.safeParse(payload);
            expect(result.success).toBe(false);
        });
    });

    describe('Errors (zAppError)', () => {
        it('should validate a standard error envelope', () => {
            const errorResponse = {
                error: 'VALIDATION_ERROR',
                message: 'Invalid input',
                requestId: 'req-123',
                details: { field: 'email', issue: 'invalid' }
            };

            const result = zAppError.safeParse(errorResponse);
            expect(result.success).toBe(true);
        });

        it('should validate a minimal error envelope', () => {
            const errorResponse = {
                error: 'INTERNAL_ERROR',
                message: 'Something went wrong'
            };

            const result = zAppError.safeParse(errorResponse);
            expect(result.success).toBe(true);
        });
    });

    describe('Theme (zThemeV1) — contract strict parse, plan 1.10', () => {
        it('valid ThemeV1 with preset and tokens (hex) → success', () => {
            const payload = {
                version: 1,
                preset: 'default',
                tokens: { accent: '#2563eb', radius: '8px', shadow: 'soft' as const },
            };
            const result = zThemeV1.strict().safeParse(payload);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.version).toBe(1);
                expect(result.data.tokens?.accent).toBe('#2563eb');
                expect(result.data.tokens?.radius).toBe('8px');
                expect(result.data.tokens?.shadow).toBe('soft');
            }
        });

        it('valid ThemeV1 preset only (no tokens) → success', () => {
            const payload = { version: 1, preset: 'warm' };
            const result = zThemeV1.strict().safeParse(payload);
            expect(result.success).toBe(true);
        });

        it('unknown keys at theme root → fail (strict)', () => {
            const payload = { version: 1, preset: 'default', unknownKey: 'x' };
            const result = zThemeV1.strict().safeParse(payload);
            expect(result.success).toBe(false);
            if (!result.success) {
                const hasUnrecognized = result.error.issues.some(
                    (i) => (i as { code?: string }).code === 'unrecognized_keys'
                );
                expect(hasUnrecognized).toBe(true);
            }
        });

        it('unknown keys in tokens → fail (strict)', () => {
            const payload = { version: 1, tokens: { accent: '#2563eb', unknownToken: '#fff' } };
            const result = zThemeV1.strict().safeParse(payload);
            expect(result.success).toBe(false);
        });

        it('color without # in tokens → fail', () => {
            const payload = { version: 1, tokens: { accent: '2563eb' } };
            const result = zThemeV1.strict().safeParse(payload);
            expect(result.success).toBe(false);
        });

        it('non-hex value in tokens → fail', () => {
            const payload = { version: 1, tokens: { accent: '#gggggg' } };
            const result = zThemeV1.strict().safeParse(payload);
            expect(result.success).toBe(false);
        });

        it('invalid preset → fail', () => {
            const payload = { version: 1, preset: 'invalid-preset' };
            const result = zThemeV1.strict().safeParse(payload);
            expect(result.success).toBe(false);
        });

        it('invalid shadow preset in tokens → fail', () => {
            const payload = { version: 1, tokens: { shadow: 'invalid' } };
            const result = zThemeV1.strict().safeParse(payload);
            expect(result.success).toBe(false);
        });
    });

    describe('ResolvedTheme (zResolvedTheme) — BFF output shape', () => {
        it('valid ResolvedTheme with all tokens → success', () => {
            const payload = {
                tokens: {
                    bg: '#ffffff',
                    paper: '#f5f5f5',
                    ink: '#1a1a1a',
                    muted: '#6b7280',
                    line: '#e5e7eb',
                    accent: '#2563eb',
                    accentWeak: '#dbeafe',
                    footerBg: '#0b1220',
                    radius: '0px',
                    shadow: 'none',
                    accentRgb: '37 99 235',
                    fontFamily: 'sans-serif',
                    fontSizeBase: '16px',
                    fontSizeSmall: '13px',
                    fontSizeLarge: '18px',
                    lineHeightBase: '1.5',
                    fontWeightNormal: 400,
                    fontWeightBold: 700,
                    fontWeightBlack: 900,
                    spaceXs: '4px',
                    spaceS: '8px',
                    spaceM: '12px',
                    spaceL: '16px',
                    spaceXl: '24px',
                    borderWidthThin: '1px',
                    borderWidthThick: '2px',
                    focusRingColor: 'rgba(37,99,235,0.5)',
                    focusRingWidth: '2px',
                },
            };
            const result = zResolvedTheme.safeParse(payload);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.tokens.accent).toBe('#2563eb');
            }
        });

        it('ResolvedTheme without layoutPreset → .default() auto-fills "default" (Phase 2.1)', () => {
            const payload = {
                tokens: {
                    bg: '#ffffff',
                    paper: '#f5f5f5',
                    ink: '#1a1a1a',
                    muted: '#6b7280',
                    line: '#e5e7eb',
                    accent: '#2563eb',
                    accentWeak: '#dbeafe',
                    footerBg: '#0b1220',
                    radius: '0px',
                    shadow: 'none',
                    accentRgb: '37 99 235',
                    fontFamily: 'sans-serif',
                    fontSizeBase: '16px',
                    fontSizeSmall: '13px',
                    fontSizeLarge: '18px',
                    lineHeightBase: '1.5',
                    fontWeightNormal: 400,
                    fontWeightBold: 700,
                    fontWeightBlack: 900,
                    spaceXs: '4px',
                    spaceS: '8px',
                    spaceM: '12px',
                    spaceL: '16px',
                    spaceXl: '24px',
                    borderWidthThin: '1px',
                    borderWidthThick: '2px',
                    focusRingColor: 'rgba(37,99,235,0.5)',
                    focusRingWidth: '2px',
                },
                brand: undefined,
                // layoutPreset intentionally omitted
            };
            const result = zResolvedTheme.safeParse(payload);
            expect(result.success).toBe(true);
            if (result.success) {
            expect(result.data.layoutPreset).toBe('default');
            }
        });
    });

});
