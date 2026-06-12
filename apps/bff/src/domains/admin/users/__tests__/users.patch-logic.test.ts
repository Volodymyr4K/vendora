/**
 * AUDIT 7: Unit test for PATCH /users role+permissions logic (regression).
 * When demoting TENANT_OWNER → TENANT_ADMIN and sending permissions in one request,
 * targetRole must be body.role (not membership.role) so permissions are applied.
 */

import { describe, it, expect } from "vitest";
import {
    getTargetRoleForPatch,
    shouldApplyPermissionsInPatch,
} from "../users.routes.js";

describe("PATCH /users targetRole and permissions logic", () => {
    it("getTargetRoleForPatch uses body.role when present (demote owner → admin)", () => {
        expect(
            getTargetRoleForPatch(
                { role: "TENANT_ADMIN" },
                { role: "TENANT_OWNER" }
            )
        ).toBe("TENANT_ADMIN");
    });

    it("getTargetRoleForPatch falls back to membership.role when body.role absent", () => {
        expect(getTargetRoleForPatch({}, { role: "TENANT_OWNER" })).toBe("TENANT_OWNER");
        expect(getTargetRoleForPatch({}, { role: "TENANT_ADMIN" })).toBe("TENANT_ADMIN");
    });

    it("shouldApplyPermissionsInPatch is true only when targetRole is TENANT_ADMIN and body.permissions set", () => {
        expect(shouldApplyPermissionsInPatch({ permissions: { admin_dashboard: { canView: true, canEdit: false } } }, "TENANT_ADMIN")).toBe(true);
        expect(shouldApplyPermissionsInPatch({ permissions: {} }, "TENANT_ADMIN")).toBe(true);
        expect(shouldApplyPermissionsInPatch({ permissions: { admin_dashboard: {} } }, "TENANT_OWNER")).toBe(false);
        expect(shouldApplyPermissionsInPatch({}, "TENANT_ADMIN")).toBe(false);
    });

    it("demote owner to admin with permissions in one request: targetRole is ADMIN so permissions apply", () => {
        const body = { role: "TENANT_ADMIN" as const, permissions: { admin_dashboard: { canView: true, canEdit: false } } };
        const membership = { role: "TENANT_OWNER" };
        const targetRole = getTargetRoleForPatch(body, membership);
        expect(targetRole).toBe("TENANT_ADMIN");
        expect(shouldApplyPermissionsInPatch(body, targetRole)).toBe(true);
    });
});
