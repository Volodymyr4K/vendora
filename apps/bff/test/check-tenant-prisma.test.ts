/**
 * Unit tests for check-tenant-prisma gate logic.
 * Ensures the gate does not accept OR/AND/NOT where patterns as safe (conscious tradeoff: ban logical operators).
 */
import { describe, it, expect } from "vitest";
import { hasTenantScope, hasLogicalOperators } from "../scripts/check-tenant-prisma.mjs";

describe("check-tenant-prisma gate", () => {
  describe("hasLogicalOperators", () => {
    it("returns true for where with OR:", () => {
      expect(hasLogicalOperators("{ OR: [{ id: 'x' }, { tenantId: 'y' }] }")).toBe(true);
    });
    it("returns true for where with AND:", () => {
      expect(hasLogicalOperators("{ AND: [{ id: evilId }, { tenantId: tid }] }")).toBe(true);
    });
    it("returns true for where with NOT:", () => {
      expect(hasLogicalOperators("{ NOT: { id: 'x' }, tenantId: 'y' }")).toBe(true);
    });
    it("returns true for nested OR with AND", () => {
      expect(hasLogicalOperators("{ OR: [{ AND: [{ id: 'a' }] }, { tenantId: tid }] }")).toBe(true);
    });
    it("returns false for plain tenantId where", () => {
      expect(hasLogicalOperators("{ tenantId: tid }")).toBe(false);
    });
    it("returns false for compound key where", () => {
      expect(hasLogicalOperators("{ tenantId_id: { tenantId, id } }")).toBe(false);
    });
    it("does not match OR: inside string value (avoid false positive)", () => {
      expect(hasLogicalOperators('{ tenantId: tid, label: "OR: something" }')).toBe(false);
    });
  });

  describe("hasTenantScope", () => {
    it("rejects OR with tenantId in branch (must not accept as safe)", () => {
      const whereContent = "{ OR: [{ id: evilId }, { tenantId: tid }] }";
      expect(hasTenantScope(whereContent)).toBe(false);
    });
    it("rejects AND with tenantId in branch (must not accept as safe)", () => {
      const whereContent = "{ AND: [{ id: evilId }, { tenantId: tid }] }";
      expect(hasTenantScope(whereContent)).toBe(false);
    });
    it("rejects NOT with tenantId elsewhere (must not accept as safe)", () => {
      const whereContent = "{ NOT: { status: 'x' }, tenantId: tid }";
      expect(hasTenantScope(whereContent)).toBe(false);
    });
    it("rejects nested OR/AND", () => {
      const whereContent = "{ OR: [{ AND: [{ id: 'a' }] }, { tenantId: tid }] }";
      expect(hasTenantScope(whereContent)).toBe(false);
    });
    it("accepts plain tenantId", () => {
      expect(hasTenantScope("{ tenantId: req.tenant!.id }")).toBe(true);
    });
    it("accepts compound key tenantId_id", () => {
      expect(hasTenantScope("{ tenantId_id: { tenantId, id } }")).toBe(true);
    });
    it("accepts compound key tenantId_branchId_variantId", () => {
      expect(hasTenantScope("{ tenantId_branchId_variantId: { tenantId, branchId, variantId } }")).toBe(true);
    });
    it("accepts compound key tenantId_provider", () => {
      expect(hasTenantScope("{ tenantId_provider: { tenantId: tid, provider } }")).toBe(true);
    });
    it("accepts where with tenantId and string containing OR: (no false positive)", () => {
      expect(hasTenantScope('{ tenantId: tid, label: "OR: something" }')).toBe(true);
    });
    it("rejects where with no tenant scope", () => {
      expect(hasTenantScope("{ id: 'x' }")).toBe(false);
    });
  });
});
