import { apiJsonWithAuth, apiJsonWithAuthTenant, apiFetchWithAuth, apiFetchWithAuthTenant } from "@/lib/server/api";
import { getBffBaseUrl } from "@/lib/bffBase";
import type {
    AdminProductCreate,
    AdminProductUpdate,
    CreateCategoryRequest,
    UpdateCategoryRequest,
    BranchSettings,
    ThemeV1,
} from "@vendora/contracts";
import type {
    AttributeDefinition,
    AttributeDefinitionCreate,
    AttributeDefinitionUpdate,
    AttributeValue,
    AttributeValueCreate,
    AttributeValueUpdate,
} from "@/lib/admin-attributes";
import type { AmContentV1 } from "@/lib/am-content";
import { zMainTemplateId, zThemeV1 } from "@vendora/contracts";

const BFF = getBffBaseUrl();

// ============================================
// MUTATIONS (Strict Error Handling)
// These functions THROW AppError on failure.
// ============================================

export async function updateAdminOrderStatus(branchSlug: string, tenantSlug: string, orderId: string, status: string) {
    await apiJsonWithAuthTenant<unknown>(`${BFF}/admin/${branchSlug}/orders/${orderId}/status`, tenantSlug, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
    });
    return true;
}

export async function createProduct(branchSlug: string, tenantSlug: string, data: AdminProductCreate) {
    return apiJsonWithAuthTenant<unknown>(`${BFF}/admin/${branchSlug}/products`, tenantSlug, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
}

export async function updateProduct(branchSlug: string, tenantSlug: string, id: string, data: AdminProductUpdate) {
    return apiJsonWithAuthTenant<unknown>(`${BFF}/admin/${branchSlug}/products/${id}`, tenantSlug, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
}

export async function toggleProductAvailability(branchSlug: string, tenantSlug: string, id: string, isAvailable: boolean) {
    return apiJsonWithAuthTenant<unknown>(`${BFF}/admin/${branchSlug}/products/${id}/toggle-availability`, tenantSlug, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAvailable })
    });
}

export async function deleteProduct(branchSlug: string, tenantSlug: string, id: string) {
    return apiJsonWithAuthTenant<unknown>(`${BFF}/admin/${branchSlug}/products/${id}`, tenantSlug, { method: "DELETE" });
}

export async function createCategory(branchSlug: string, tenantSlug: string, data: CreateCategoryRequest) {
    return apiJsonWithAuthTenant<unknown>(`${BFF}/admin/${branchSlug}/categories`, tenantSlug, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
}

export async function updateCategory(branchSlug: string, tenantSlug: string, id: string, data: UpdateCategoryRequest) {
    return apiJsonWithAuthTenant<unknown>(`${BFF}/admin/${branchSlug}/categories/${id}`, tenantSlug, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
}

export async function deleteCategory(branchSlug: string, tenantSlug: string, id: string) {
    return apiJsonWithAuthTenant<unknown>(`${BFF}/admin/${branchSlug}/categories/${id}`, tenantSlug, { method: "DELETE" });
}

export async function toggleCategoryAvailability(branchSlug: string, tenantSlug: string, id: string, isAvailable: boolean) {
    return apiJsonWithAuthTenant<unknown>(`${BFF}/admin/${branchSlug}/categories/${id}/toggle-availability`, tenantSlug, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAvailable })
    });
}

export async function reorderCategories(branchSlug: string, tenantSlug: string, ids: string[]) {
    return apiJsonWithAuthTenant<unknown>(`${BFF}/admin/${branchSlug}/categories/reorder`, tenantSlug, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids })
    });
}

// ============================================
// Catalog Attribute Definitions / Values (tenant-level)
// ============================================

export async function getAttributeDefinitions(tenantSlug: string): Promise<AttributeDefinition[]> {
    return apiJsonWithAuthTenant<AttributeDefinition[]>(`${BFF}/admin/attribute-definitions`, tenantSlug, { method: "GET" });
}

export async function createAttributeDefinition(tenantSlug: string, data: AttributeDefinitionCreate): Promise<AttributeDefinition> {
    return apiJsonWithAuthTenant<AttributeDefinition>(`${BFF}/admin/attribute-definitions`, tenantSlug, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
}

export async function updateAttributeDefinition(tenantSlug: string, id: string, data: AttributeDefinitionUpdate): Promise<AttributeDefinition> {
    return apiJsonWithAuthTenant<AttributeDefinition>(`${BFF}/admin/attribute-definitions/${id}`, tenantSlug, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
}

export async function deleteAttributeDefinition(tenantSlug: string, id: string): Promise<{ ok: true }> {
    return apiJsonWithAuthTenant<{ ok: true }>(`${BFF}/admin/attribute-definitions/${id}`, tenantSlug, {
        method: "DELETE",
    });
}

export async function getAttributeValues(tenantSlug: string, query?: {
    itemId?: string;
    definitionId?: string;
    valueString?: string;
    valueNumber?: number;
    valueBool?: boolean;
    valueDate?: string;
}): Promise<AttributeValue[]> {
    const params = new URLSearchParams();
    if (query?.itemId) params.set("itemId", query.itemId);
    if (query?.definitionId) params.set("definitionId", query.definitionId);
    if (query?.valueString !== undefined) params.set("valueString", query.valueString);
    if (query?.valueNumber !== undefined) params.set("valueNumber", String(query.valueNumber));
    if (query?.valueBool !== undefined) params.set("valueBool", String(query.valueBool));
    if (query?.valueDate !== undefined) params.set("valueDate", query.valueDate);
    const suffix = params.toString();
    const url = suffix ? `${BFF}/admin/attribute-values?${suffix}` : `${BFF}/admin/attribute-values`;
    return apiJsonWithAuthTenant<AttributeValue[]>(url, tenantSlug, { method: "GET" });
}

export async function createAttributeValue(tenantSlug: string, data: AttributeValueCreate): Promise<AttributeValue> {
    return apiJsonWithAuthTenant<AttributeValue>(`${BFF}/admin/attribute-values`, tenantSlug, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
}

export async function updateAttributeValue(tenantSlug: string, id: string, data: AttributeValueUpdate): Promise<AttributeValue> {
    return apiJsonWithAuthTenant<AttributeValue>(`${BFF}/admin/attribute-values/${id}`, tenantSlug, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
}

export async function deleteAttributeValue(tenantSlug: string, id: string): Promise<{ ok: true }> {
    return apiJsonWithAuthTenant<{ ok: true }>(`${BFF}/admin/attribute-values/${id}`, tenantSlug, {
        method: "DELETE",
    });
}

export async function updateBranchSettings(branchSlug: string, tenantSlug: string, data: Partial<BranchSettings>) {
    return apiJsonWithAuthTenant<unknown>(`${BFF}/admin/${branchSlug}/settings`, tenantSlug, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
}

// ============================================
// AM Content (tenant-level)
// ============================================

export async function getAdminContent(tenantSlug: string): Promise<{ amContent: AmContentV1 | null }> {
    return apiJsonWithAuthTenant<{ amContent: AmContentV1 | null }>(`${BFF}/admin/content`, tenantSlug, {
        method: "GET",
    });
}

export async function updateAdminContent(tenantSlug: string, amContent: AmContentV1 | null): Promise<{ amContent: AmContentV1 | null }> {
    return apiJsonWithAuthTenant<{ amContent: AmContentV1 | null }>(`${BFF}/admin/content`, tenantSlug, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amContent }),
    });
}

// ============================================
// Journal (tenant-level)
// ============================================

export type JournalTranslationInput = {
    locale: string;
    title: string;
    excerpt?: string | null;
    markdown?: string;
};

export type AdminJournalListItem = {
    id: string;
    slug: string;
    status: "DRAFT" | "PUBLISHED";
    publishedAt: string | null;
    coverImageKey: string | null;
    homeSlot: number | null;
    updatedAt: string;
    translations: Array<{ locale: string; title: string }>;
    missingLocales: string[];
};

export async function getAdminJournalList(
    tenantSlug: string,
    args?: { cursor?: string; limit?: number; status?: "DRAFT" | "PUBLISHED" }
): Promise<{ items: AdminJournalListItem[]; nextCursor: string | null }> {
    const qs = new URLSearchParams();
    if (args?.cursor) qs.set("cursor", args.cursor);
    if (args?.limit) qs.set("limit", String(args.limit));
    if (args?.status) qs.set("status", args.status);
    const url = `${BFF}/admin/journal${qs.toString() ? `?${qs.toString()}` : ""}`;
    return apiJsonWithAuthTenant<{ items: AdminJournalListItem[]; nextCursor: string | null }>(url, tenantSlug, {
        method: "GET",
    });
}

export type AdminJournalPost = {
    id: string;
    slug: string;
    status: "DRAFT" | "PUBLISHED";
    publishedAt: string | null;
    coverImageKey: string | null;
    homeSlot: number | null;
    createdAt: string;
    updatedAt: string;
    translations: Array<{
        locale: string;
        title: string;
        excerpt: string | null;
        markdown: string;
        updatedAt: string;
    }>;
};

export async function getAdminJournalPost(tenantSlug: string, id: string): Promise<AdminJournalPost> {
    return apiJsonWithAuthTenant<AdminJournalPost>(`${BFF}/admin/journal/${id}`, tenantSlug, { method: "GET" });
}

export async function createAdminJournalDraft(
    tenantSlug: string,
    data: { slug?: string; coverImageKey?: string | null; translations: JournalTranslationInput[] }
): Promise<{ id: string; slug: string; status: "DRAFT" | "PUBLISHED" }> {
    return apiJsonWithAuthTenant<{ id: string; slug: string; status: "DRAFT" | "PUBLISHED" }>(`${BFF}/admin/journal`, tenantSlug, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
}

export async function patchAdminJournalDraft(
    tenantSlug: string,
    id: string,
    data: { slug?: string; coverImageKey?: string | null; translations?: JournalTranslationInput[] }
): Promise<{ id: string; slug: string; status: "DRAFT" | "PUBLISHED"; updatedAt: string }> {
    return apiJsonWithAuthTenant<{ id: string; slug: string; status: "DRAFT" | "PUBLISHED"; updatedAt: string }>(`${BFF}/admin/journal/${id}`, tenantSlug, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
}

export async function deleteAdminJournalDraft(tenantSlug: string, id: string): Promise<{ success: true }> {
    return apiJsonWithAuthTenant<{ success: true }>(`${BFF}/admin/journal/${id}`, tenantSlug, { method: "DELETE" });
}

export async function publishAdminJournalPost(
    tenantSlug: string,
    id: string
): Promise<{ id: string; slug: string; status: "DRAFT" | "PUBLISHED"; publishedAt: string | null }> {
    return apiJsonWithAuthTenant<{ id: string; slug: string; status: "DRAFT" | "PUBLISHED"; publishedAt: string | null }>(
        `${BFF}/admin/journal/${id}/publish`,
        tenantSlug,
        { method: "POST" }
    );
}

export async function unpublishAdminJournalPost(
    tenantSlug: string,
    id: string
): Promise<{ id: string; slug: string; status: "DRAFT" | "PUBLISHED"; publishedAt: string | null }> {
    return apiJsonWithAuthTenant<{ id: string; slug: string; status: "DRAFT" | "PUBLISHED"; publishedAt: string | null }>(
        `${BFF}/admin/journal/${id}/unpublish`,
        tenantSlug,
        { method: "POST" }
    );
}

export async function setAdminJournalHomeSlot(
    tenantSlug: string,
    id: string,
    homeSlot: number | null
): Promise<{ id: string; homeSlot: number | null; updatedAt: string }> {
    return apiJsonWithAuthTenant<{ id: string; homeSlot: number | null; updatedAt: string }>(
        `${BFF}/admin/journal/${id}/home-slot`,
        tenantSlug,
        {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ homeSlot }),
        }
    );
}

// ============================================
// ACCESS_LEVELS Phase 5: Tenant users (owner only)
// ============================================

/** Phase 3.5: optional scopeType and branchIds for branch-scoped permissions. */
export type TenantMemberPermissionInput = {
    canView: boolean;
    canEdit: boolean;
    scopeType?: "ALL" | "BRANCH";
    branchIds?: string[] | null;
};
export async function addTenantMember(
    tenantSlug: string,
    data: { email: string; role: "TENANT_OWNER" | "TENANT_ADMIN"; permissions?: Record<string, TenantMemberPermissionInput> }
) {
    return apiJsonWithAuthTenant<{ userId: string; email: string; role: string }>(`${BFF}/admin/users`, tenantSlug, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
}

export async function updateTenantMember(
    tenantSlug: string,
    userId: string,
    data: { role?: "TENANT_OWNER" | "TENANT_ADMIN"; permissions?: Record<string, TenantMemberPermissionInput> }
) {
    return apiJsonWithAuthTenant<unknown>(`${BFF}/admin/users/${userId}`, tenantSlug, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
}

export async function removeTenantMember(tenantSlug: string, userId: string) {
    const res = await apiFetchWithAuthTenant(`${BFF}/admin/users/${userId}`, tenantSlug, { method: "DELETE" });
    if (res.status === 400) {
        const json = await res.json().catch(() => ({}));
        if (json.code === "LAST_OWNER") {
            throw new Error(json.error || "Cannot remove the last owner.");
        }
    }
    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
    }
}

// ============================================
// SUPER ADMIN MUTATIONS
// ============================================

export async function createTenant(data: { name: string; slug: string; adminEmail: string; adminPassword: string }) {
    return apiJsonWithAuth<unknown>(`${BFF}/super/tenants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
}

export async function updateTenant(id: string, data: { name?: string; slug?: string; isActive?: boolean; countryCode?: string; currency?: string; features?: unknown }) {
    return apiJsonWithAuth<unknown>(`${BFF}/super/tenants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
}

export async function updateTenantTheme(tenantId: string, theme: ThemeV1): Promise<void> {
    // Validate input before sending (fail fast)
    zThemeV1.parse(theme);

    // Use apiFetchWithAuth for 204 No Content (no JSON body to parse)
    const res = await apiFetchWithAuth(`${BFF}/super/tenants/${tenantId}/theme`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(theme),
    });

    if (!res.ok) {
        // Handle error responses (try to parse JSON error if present)
        const text = await res.text();
        try {
            const json = JSON.parse(text);
            throw new Error(json.message || json.error || `HTTP ${res.status}`);
        } catch {
            throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
        }
    }

    // 204 No Content - success, no body to parse
    return;
}

export async function updateTenantMainTemplate(tenantId: string, mainTemplate: string): Promise<{
    tenantId: string;
    tenantSlug: string;
    mainTemplate: string;
}> {
    const normalized = mainTemplate.trim().toLowerCase();
    zMainTemplateId.parse(normalized);

    return apiJsonWithAuth(`${BFF}/super/tenants/${tenantId}/main-template`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mainTemplate: normalized }),
    });
}

export async function toggleTenant(id: string) {
    return apiJsonWithAuth<unknown>(`${BFF}/super/tenants/${id}/toggle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
    });
}

export async function deleteTenant(id: string) {
    return apiJsonWithAuth<unknown>(`${BFF}/super/tenants/${id}`, {
        method: "DELETE",
    });
}

export async function createBranch(tenantId: string, data: { name: string; slug: string; cityName: string; address: string; phone: string }) {
    return apiJsonWithAuth<unknown>(`${BFF}/super/tenants/${tenantId}/branches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
}

export async function updateBranch(tenantId: string, branchId: string, data: Partial<{ slug: string; cityName: string; address: string; phones: string[] }>) {
    return apiJsonWithAuth<unknown>(`${BFF}/super/tenants/${tenantId}/branches/${branchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
}

// ============================================
// UPLOAD MUTATION
// ============================================



export async function uploadFile(
    formData: FormData,
    tenantSlug: string
): Promise<{ url: string; urlPath?: string; objectKey?: string }> {
    // Canonical endpoint: POST /admin/upload (tenantScope prefix "/admin" + route "/upload").
    // Backward-compat alias still exists at /admin/admin/upload.
    const res = await apiFetchWithAuth(`${BFF}/admin/upload`, {
        method: "POST",
        body: formData, // fetch handles multipart boundary automatically
        headers: { "x-tenant-slug": tenantSlug }
    });

    if (!res.ok) {
        // Try parsing error
        const text = await res.text();
        try {
            const json = JSON.parse(text);
            // Re-use isAppError check if possible, or just throw json
            if (json && typeof json === 'object' && ('message' in json || 'error' in json)) {
                // Mimic AppError behavior
                // Ideally import isAppError but let's just throw generic Error with message
                throw new Error(json.message || json.error || `Upload failed: ${res.status}`);
            }
        } catch {
            // Ignore JSON parse error, throw raw text
        }
        throw new Error(`Upload failed (HTTP ${res.status}): ${text.substring(0, 100)}`);
    }

    const text = await res.text();
    try {
        return JSON.parse(text) as { url: string; urlPath?: string; objectKey?: string };
    } catch {
        throw new Error("Invalid server response (expected JSON)");
    }
}
