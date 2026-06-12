"use client";

import { useEffect, useState, useTransition } from "react";
import {
    getAdminUsersAction,
    getAdminBranchesAction,
    addTenantMemberAction,
    updateTenantMemberAction,
    removeTenantMemberAction,
} from "@/app/actions";
import type { AdminMember, AdminMemberPermission, AdminUsersResponse, AdminBranchItem } from "@/lib/data";
import { BRANCH_SCOPED_ADMIN_MODULE_IDS, OWNER_ONLY_ADMIN_MODULE_IDS, type AdminModuleId } from "@vendora/contracts";
import { useAdminContext } from "../AdminContext";
import { useThemeOptional } from "@/lib/theme/client";
import { getThemedButton } from "@/lib/components/button-registry";
import { getThemedCheckbox } from "@/lib/components/checkbox-registry";
import { getThemedRadio } from "@/lib/components/radio-registry";
import { getThemedInput } from "@/lib/components/input-registry";
import { getThemedSelect } from "@/lib/components/select-registry";

const MODULE_ID = "admin_users";
const ROLE_LABEL: Record<string, string> = { TENANT_OWNER: "Owner", TENANT_ADMIN: "Admin" };

/** Owner-only modules from contracts (SSOT); do not show in permissions list for admins (dead permission). */
function modulesAssignableToAdmin(enabledIds: AdminModuleId[]): AdminModuleId[] {
    return enabledIds.filter((id) => !OWNER_ONLY_ADMIN_MODULE_IDS.includes(id));
}

/** Phase 3.5: allowlist from contracts (SSOT). */
const BRANCH_SCOPED_MODULE_IDS = new Set<AdminModuleId>(BRANCH_SCOPED_ADMIN_MODULE_IDS);

function defaultPermission(): AdminMemberPermission {
    return { canView: false, canEdit: false, scopeType: "ALL", branchIds: [] };
}

/** UI/UX: valid for submit when every BRANCH-scoped permission with scopeType=BRANCH has ≥1 branchId, and branches list is non-empty when BRANCH selected. */
function permissionsBranchScopeValid(
    perms: Record<string, AdminMemberPermission>,
    assignableModuleIds: AdminModuleId[],
    branchesAvailable: number
): boolean {
    for (const moduleId of assignableModuleIds) {
        if (!BRANCH_SCOPED_MODULE_IDS.has(moduleId)) continue;
        const p = perms[moduleId];
        if (!p || p.scopeType !== "BRANCH") continue;
        if (branchesAvailable === 0) return false;
        if (p.branchIds.length < 1) return false;
    }
    return true;
}

/** Shown on write/403 errors so user knows to refresh if permissions changed. */
const WRITE_ERROR_HINT = " Refresh the page if your permissions were changed.";

/** Type guard: narrows data (AdminUsersResponse | null | "forbidden") to AdminUsersResponse. */
function isAdminUsersResponse(data: unknown): data is AdminUsersResponse {
    return (
        typeof data === "object" &&
        data !== null &&
        "enabledAdminModuleIds" in data &&
        Array.isArray((data as Record<string, unknown>).enabledAdminModuleIds)
    );
}

export default function AdminUsersPage({ params }: { params: Promise<{ tenantSlug: string; branchSlug: string }> }) {
    const { canEdit } = useAdminContext();
    const canEditUsers = canEdit(MODULE_ID);
    const theme = useThemeOptional();
    const componentSet = theme?.componentSet ?? "default";
    const [tenantSlug, setTenantSlug] = useState("");
    const [data, setData] = useState<AdminUsersResponse | null | "forbidden">(null);
    const [branches, setBranches] = useState<AdminBranchItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [addEmail, setAddEmail] = useState("");
    const [addRole, setAddRole] = useState<"TENANT_OWNER" | "TENANT_ADMIN">("TENANT_ADMIN");
    const [addPermissions, setAddPermissions] = useState<Record<string, AdminMemberPermission>>({});
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [editPermissions, setEditPermissions] = useState<Record<string, AdminMemberPermission>>({});
    const [isPending, startTransition] = useTransition();
    
    const Button = getThemedButton({ componentSet, tenantOverrideKey: tenantSlug });
    const Checkbox = getThemedCheckbox({ componentSet, tenantOverrideKey: tenantSlug });
    const Radio = getThemedRadio({ componentSet, tenantOverrideKey: tenantSlug });
    const Input = getThemedInput({ componentSet, tenantOverrideKey: tenantSlug });
    const Select = getThemedSelect({ componentSet, tenantOverrideKey: tenantSlug });

    useEffect(() => {
        params.then((p) => {
            setTenantSlug(p.tenantSlug);
            load(p.tenantSlug);
        });
    }, [params]);

    async function load(t: string) {
        setLoading(true);
        setMessage(null);
        try {
            const [usersRes, branchesRes] = await Promise.all([
                getAdminUsersAction(t),
                getAdminBranchesAction(t),
            ]);
            if (usersRes === null) {
                setData("forbidden");
            } else {
                setData(usersRes);
                setAddPermissions(
                    usersRes.enabledAdminModuleIds.reduce(
                        (acc, id) => {
                            acc[id] = defaultPermission();
                            return acc;
                        },
                        {} as Record<string, AdminMemberPermission>
                    )
                );
            }
            setBranches(branchesRes?.branches ?? []);
        } catch (e) {
            setMessage({ type: "error", text: String(e) + WRITE_ERROR_HINT });
        } finally {
            setLoading(false);
        }
    }

    function openEdit(m: AdminMember) {
        if (m.role !== "TENANT_ADMIN") return;
        setEditingUserId(m.userId);
        setEditPermissions(m.permissions ? { ...m.permissions } : {});
    }

    function handleAdd() {
        const usersData = isAdminUsersResponse(data) ? data : null;
        if (!tenantSlug || !usersData) return;
        if (
            addRole === "TENANT_ADMIN" &&
            !permissionsBranchScopeValid(
                addPermissions,
                modulesAssignableToAdmin(usersData.enabledAdminModuleIds),
                branches.length
            )
        ) {
            return;
        }
        startTransition(async () => {
            setMessage(null);
            try {
                await addTenantMemberAction(tenantSlug, {
                    email: addEmail.trim(),
                    role: addRole,
                    permissions: addRole === "TENANT_ADMIN" ? addPermissions : undefined,
                });
                setMessage({ type: "success", text: "Member added." });
                setAddEmail("");
                setAddRole("TENANT_ADMIN");
                setAddPermissions(
                    usersData.enabledAdminModuleIds.reduce(
                        (acc, id) => {
                            acc[id] = defaultPermission();
                            return acc;
                        },
                        {} as Record<string, AdminMemberPermission>
                    )
                );
                load(tenantSlug);
            } catch (e) {
                setMessage({ type: "error", text: String(e) + WRITE_ERROR_HINT });
            }
        });
    }

    function handleUpdatePermissions() {
        if (!tenantSlug || !editingUserId) return;
        if (!isAdminUsersResponse(data)) return;
        if (
            !permissionsBranchScopeValid(
                editPermissions,
                modulesAssignableToAdmin(data.enabledAdminModuleIds),
                branches.length
            )
        ) {
            return;
        }
        startTransition(async () => {
            setMessage(null);
            try {
                await updateTenantMemberAction(tenantSlug, editingUserId, { permissions: editPermissions });
                setMessage({ type: "success", text: "Permissions updated." });
                setEditingUserId(null);
                load(tenantSlug);
            } catch (e) {
                setMessage({ type: "error", text: String(e) + WRITE_ERROR_HINT });
            }
        });
    }

    function handleRoleChange(m: AdminMember, newRole: "TENANT_OWNER" | "TENANT_ADMIN") {
        if (!tenantSlug) return;
        startTransition(async () => {
            setMessage(null);
            try {
                await updateTenantMemberAction(tenantSlug, m.userId, { role: newRole });
                setMessage({ type: "success", text: "Role updated." });
                load(tenantSlug);
            } catch (e) {
                setMessage({ type: "error", text: String(e) + WRITE_ERROR_HINT });
            }
        });
    }

    function handleRemove(m: AdminMember) {
        if (!tenantSlug || !confirm(`Remove ${m.email} from this tenant?`)) return;
        startTransition(async () => {
            setMessage(null);
            try {
                await removeTenantMemberAction(tenantSlug, m.userId);
                setMessage({ type: "success", text: "Member removed." });
                load(tenantSlug);
            } catch (e) {
                setMessage({ type: "error", text: String(e) + WRITE_ERROR_HINT });
            }
        });
    }

    if (loading && !data) {
        return <div style={{ padding: 20 }}>Loading...</div>;
    }
    if (data === "forbidden") {
        return (
            <div style={{ padding: 20 }}>
                <p className="text-danger">No access. Only owners can manage users.</p>
            </div>
        );
    }
    const usersData = isAdminUsersResponse(data) ? data : null;
    if (!usersData) {
        return (
            <div style={{ padding: 20 }}>
                <div className="bg-danger-weak border-danger" style={{ padding: 24, border: "1px solid", borderRadius: 8, maxWidth: 480 }}>
                    <div className="text-danger" style={{ fontWeight: 600 }}>Не вдалося завантажити користувачів</div>
                    <p className="text-danger opacity-80" style={{ marginTop: 8, fontSize: 14 }}>
                        Отримано неочікувану відповідь. Оновіть сторінку або спробуйте ще раз.
                    </p>
                    {message && (
                        <div className="bg-danger-weak text-danger" style={{ marginTop: 12, padding: 10, borderRadius: 6, fontSize: 13 }}>
                            {message.text}
                        </div>
                    )}
                    <Button
                        type="button"
                        variant="outline"
                        className="bg-danger-weak text-danger border-danger"
                        style={{ marginTop: 12, padding: "8px 16px", borderRadius: 6, border: "1px solid", cursor: "pointer", fontSize: 14 }}
                        onClick={() => load(tenantSlug)}
                    >
                        Оновити
                    </Button>
                </div>
            </div>
        );
    }

    const { members, enabledAdminModuleIds } = usersData;

    return (
        <div style={{ padding: 20 }}>
            {!canEditUsers && (
                <div className="bg-warning-weak text-warning" style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 20, fontSize: 14 }}>
                    Read-only: you can view members but not add, edit, or remove them.
                </div>
            )}
            <h2 style={{ marginBottom: 20 }}>Users (members & permissions)</h2>
            {message && (
                <div
                    className={message.type === "success" ? "bg-success-weak text-success" : "bg-danger-weak text-danger"}
                    style={{
                        marginBottom: 16,
                        padding: 12,
                        borderRadius: 8,
                    }}
                >
                    {message.text}
                </div>
            )}

            {/* Add member */}
            {canEditUsers && (
            <div style={{ marginBottom: 24, padding: 16, background: "var(--paper)", borderRadius: 8 }}>
                <h3 style={{ marginBottom: 12 }}>Add member</h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
                    <label>
                        Email
                        <Input
                            type="email"
                            value={addEmail}
                            onChange={(e) => setAddEmail(e.target.value)}
                            placeholder="user@example.com"
                            style={{ marginLeft: 8, padding: 6 }}
                        />
                    </label>
                    <label>
                        Role
                        <Select
                            value={addRole}
                            onChange={(e) => setAddRole(e.target.value as "TENANT_OWNER" | "TENANT_ADMIN")}
                            style={{ marginLeft: 8, padding: 6 }}
                            options={[
                                { value: "TENANT_ADMIN", label: "Admin" },
                                { value: "TENANT_OWNER", label: "Owner" },
                            ]}
                        />
                    </label>
                    <Button
                        onClick={handleAdd}
                        disabled={
                            !addEmail.trim() ||
                            isPending ||
                            (addRole === "TENANT_ADMIN" &&
                                !permissionsBranchScopeValid(
                                    addPermissions,
                                    modulesAssignableToAdmin(enabledAdminModuleIds),
                                    branches.length
                                ))
                        }
                        variant="primary"
                    >
                        {isPending ? "Adding..." : "Add"}
                    </Button>
                </div>
                {addRole === "TENANT_ADMIN" &&
                    enabledAdminModuleIds.length > 0 &&
                    !permissionsBranchScopeValid(
                        addPermissions,
                        modulesAssignableToAdmin(enabledAdminModuleIds),
                        branches.length
                    ) && (
                        <div className="bg-warning-weak text-warning" style={{ marginTop: 8, padding: 8, borderRadius: 6, fontSize: 14 }}>
                            For «Selected branches» choose at least one branch. If there are no branches, use «All branches» or add branches first.
                        </div>
                    )}
                {addRole === "TENANT_ADMIN" && enabledAdminModuleIds.length > 0 && (
                    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                        <strong>Permissions (enabled modules)</strong>
                        {modulesAssignableToAdmin(enabledAdminModuleIds).map((moduleId) => {
                            const perm = addPermissions[moduleId] ?? defaultPermission();
                            const isBranchScoped = BRANCH_SCOPED_MODULE_IDS.has(moduleId);
                            return (
                                <div key={moduleId} style={{ display: "flex", flexDirection: "column", gap: 4, padding: 8, background: "var(--paper)", borderRadius: 6 }}>
                                    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                                        <span style={{ minWidth: 200 }}>{moduleId}</span>
                                        <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                            <Checkbox
                                                checked={perm.canView}
                                                onChange={(e) => {
                                                    const checked = e.target.checked;
                                                    setAddPermissions((prev) => ({
                                                        ...prev,
                                                        [moduleId]: { ...(prev[moduleId] ?? defaultPermission()), canView: checked },
                                                    }));
                                                }}
                                            />
                                            View
                                        </label>
                                        <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                            <Checkbox
                                                checked={perm.canEdit}
                                                onChange={(e) => {
                                                    const checked = e.target.checked;
                                                    setAddPermissions((prev) => ({
                                                        ...prev,
                                                        [moduleId]: { ...(prev[moduleId] ?? defaultPermission()), canView: checked ? true : (prev[moduleId]?.canView ?? false), canEdit: checked },
                                                    }));
                                                }}
                                            />
                                            Edit
                                        </label>
                                        {isBranchScoped && (
                                            <>
                                                <span style={{ marginLeft: 8 }}>Scope:</span>
                                                <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                                    <Radio
                                                        name={`add-scope-${moduleId}`}
                                                        checked={perm.scopeType === "ALL"}
                                                        onChange={() =>
                                                            setAddPermissions((prev) => ({
                                                                ...prev,
                                                                [moduleId]: { ...(prev[moduleId] ?? defaultPermission()), scopeType: "ALL", branchIds: [] },
                                                            }))
                                                        }
                                                    />
                                                    All branches
                                                </label>
                                                <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                                    <Radio
                                                        name={`add-scope-${moduleId}`}
                                                        checked={perm.scopeType === "BRANCH"}
                                                        onChange={() =>
                                                            setAddPermissions((prev) => ({
                                                                ...prev,
                                                                [moduleId]: { ...(prev[moduleId] ?? defaultPermission()), scopeType: "BRANCH", branchIds: perm.branchIds },
                                                            }))
                                                        }
                                                    />
                                                    Selected branches
                                                </label>
                                            </>
                                        )}
                                    </div>
                                    {isBranchScoped && perm.scopeType === "BRANCH" && branches.length === 0 && (
                                        <div className="text-warning" style={{ marginLeft: 200, fontSize: 13 }}>
                                            No branches in this tenant. Use «All branches» or add branches first.
                                        </div>
                                    )}
                                    {isBranchScoped && perm.scopeType === "BRANCH" && branches.length > 0 && (
                                        <div style={{ marginLeft: 200, display: "flex", flexWrap: "wrap", gap: 8 }}>
                                            {branches.map((b) => (
                                                <label key={b.id} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                                    <Checkbox
                                                        checked={perm.branchIds.includes(b.id)}
                                                        onChange={(e) => {
                                                            const checked = e.target.checked;
                                                            setAddPermissions((prev) => {
                                                                const p = prev[moduleId] ?? defaultPermission();
                                                                const nextIds = checked ? [...p.branchIds, b.id] : p.branchIds.filter((id) => id !== b.id);
                                                                return { ...prev, [moduleId]: { ...p, branchIds: nextIds } };
                                                            });
                                                        }}
                                                    />
                                                    {b.cityName} ({b.slug})
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            )}

            {/* List */}
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                    <tr style={{ borderBottom: "2px solid var(--line)", textAlign: "left" }}>
                        <th style={{ padding: 8 }}>Email</th>
                        <th style={{ padding: 8 }}>Role</th>
                        <th style={{ padding: 8 }}>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {members.map((m) => (
                        <tr key={m.userId} style={{ borderBottom: "1px solid var(--line)" }}>
                            <td style={{ padding: 8 }}>{m.email}</td>
                            <td style={{ padding: 8 }}>
                                {canEditUsers ? (
                                    <Select
                                        value={m.role}
                                        onChange={(e) =>
                                            handleRoleChange(m, e.target.value as "TENANT_OWNER" | "TENANT_ADMIN")
                                        }
                                        disabled={isPending}
                                        style={{ padding: 4 }}
                                        options={[
                                            { value: "TENANT_ADMIN", label: "Admin" },
                                            { value: "TENANT_OWNER", label: "Owner" },
                                        ]}
                                    />
                                ) : (
                                    <span>{ROLE_LABEL[m.role] ?? m.role}</span>
                                )}
                            </td>
                            <td style={{ padding: 8 }}>
                                {canEditUsers && (
                                    <>
                                        {m.role === "TENANT_ADMIN" && editingUserId !== m.userId && (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={() => openEdit(m)}
                                                style={{ marginRight: 8, padding: "4px 8px" }}
                                            >
                                                Edit permissions
                                            </Button>
                                        )}
                                        {editingUserId === m.userId && (
                                            <Button
                                                type="button"
                                                variant="primary"
                                                onClick={handleUpdatePermissions}
                                                disabled={isPending}
                                                style={{ marginRight: 8, padding: "4px 8px" }}
                                            >
                                                Save
                                            </Button>
                                        )}
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => handleRemove(m)}
                                            disabled={isPending}
                                            className="text-danger"
                                            style={{ padding: "4px 8px" }}
                                        >
                                            Remove
                                        </Button>
                                    </>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Edit permissions modal (inline) — only when canEditUsers */}
            {canEditUsers && editingUserId && (
                <div className="bg-info-weak" style={{ marginTop: 24, padding: 16, borderRadius: 8 }}>
                    <strong>Edit permissions</strong>
                    {modulesAssignableToAdmin(enabledAdminModuleIds).map((moduleId) => {
                        const perm = editPermissions[moduleId] ?? defaultPermission();
                        const isBranchScoped = BRANCH_SCOPED_MODULE_IDS.has(moduleId);
                        return (
                            <div key={moduleId} style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8, padding: 8, background: "var(--paper)", borderRadius: 6 }}>
                                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                                    <span style={{ minWidth: 200 }}>{moduleId}</span>
                                    <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                        <Checkbox
                                            checked={perm.canView}
                                            onChange={(e) => {
                                                const checked = e.target.checked;
                                                setEditPermissions((prev) => ({
                                                    ...prev,
                                                    [moduleId]: { ...(prev[moduleId] ?? defaultPermission()), canView: checked },
                                                }));
                                            }}
                                        />
                                        View
                                    </label>
                                    <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                        <Checkbox
                                            checked={perm.canEdit}
                                            onChange={(e) => {
                                                const checked = e.target.checked;
                                                setEditPermissions((prev) => ({
                                                    ...prev,
                                                    [moduleId]: { ...(prev[moduleId] ?? defaultPermission()), canView: checked ? true : (prev[moduleId]?.canView ?? false), canEdit: checked },
                                                }));
                                            }}
                                        />
                                        Edit
                                    </label>
                                    {isBranchScoped && (
                                        <>
                                            <span style={{ marginLeft: 8 }}>Scope:</span>
                                            <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                                <Radio
                                                    name={`edit-scope-${moduleId}-${editingUserId}`}
                                                    checked={perm.scopeType === "ALL"}
                                                    onChange={() =>
                                                        setEditPermissions((prev) => ({
                                                            ...prev,
                                                            [moduleId]: { ...(prev[moduleId] ?? defaultPermission()), scopeType: "ALL", branchIds: [] },
                                                        }))
                                                    }
                                                />
                                                All branches
                                            </label>
                                            <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                                <Radio
                                                    name={`edit-scope-${moduleId}-${editingUserId}`}
                                                    checked={perm.scopeType === "BRANCH"}
                                                    onChange={() =>
                                                        setEditPermissions((prev) => ({
                                                            ...prev,
                                                            [moduleId]: { ...(prev[moduleId] ?? defaultPermission()), scopeType: "BRANCH", branchIds: perm.branchIds },
                                                        }))
                                                    }
                                                />
                                                Selected branches
                                            </label>
                                        </>
                                    )}
                                </div>
                                {isBranchScoped && perm.scopeType === "BRANCH" && branches.length === 0 && (
                                    <div className="text-warning" style={{ marginLeft: 200, fontSize: 13 }}>
                                        No branches in this tenant. Use «All branches» or add branches first.
                                    </div>
                                )}
                                {isBranchScoped && perm.scopeType === "BRANCH" && branches.length > 0 && (
                                    <div style={{ marginLeft: 200, display: "flex", flexWrap: "wrap", gap: 8 }}>
                                        {branches.map((b) => (
                                            <label key={b.id} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                                <Checkbox
                                                    checked={perm.branchIds.includes(b.id)}
                                                    onChange={(e) => {
                                                        const checked = e.target.checked;
                                                        setEditPermissions((prev) => {
                                                            const p = prev[moduleId] ?? defaultPermission();
                                                            const nextIds = checked ? [...p.branchIds, b.id] : p.branchIds.filter((id) => id !== b.id);
                                                            return { ...prev, [moduleId]: { ...p, branchIds: nextIds } };
                                                        });
                                                    }}
                                                />
                                                {b.cityName} ({b.slug})
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {!permissionsBranchScopeValid(
                        editPermissions,
                        modulesAssignableToAdmin(enabledAdminModuleIds),
                        branches.length
                    ) && (
                        <div className="bg-warning-weak text-warning" style={{ marginTop: 8, padding: 8, borderRadius: 6, fontSize: 14 }}>
                            For «Selected branches» choose at least one branch. If there are no branches, use «All branches» or add branches first.
                        </div>
                    )}
                    <div style={{ marginTop: 12 }}>
                        <Button type="button" variant="outline" onClick={() => setEditingUserId(null)} style={{ marginRight: 8 }}>
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="primary"
                            onClick={handleUpdatePermissions}
                            disabled={
                                isPending ||
                                !permissionsBranchScopeValid(
                                    editPermissions,
                                    modulesAssignableToAdmin(enabledAdminModuleIds),
                                    branches.length
                                )
                            }
                        >
                            Save
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
