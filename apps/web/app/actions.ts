"use server";

// Logger Removed: Unused after migration

import { isAppError } from "@/lib/errors";
import { FetchJsonError } from "@/lib/data";

import {
    getAdminOrders,
    getAdminMenu,
    getBranchSettings,
    getDashboardStats,
    getBranchConfig,
    getAdminUsers,
    getAdminMe,
    getAdminBranches,
} from "@/lib/data";
import type { AdminUsersResponse, AdminMeResponse, AdminBranchesResponse } from "@/lib/data";

import { apiJson, apiJsonWithAuth, apiJsonWithAuthTenant, HttpError } from "@/lib/server/api";
import type { TenantMemberPermissionInput } from "@/lib/server/mutations";
import { getBffBaseUrl } from "@/lib/bffBase";
import { zReorderResponse } from "@vendora/contracts";
import type {
    AdminProductCreate,
    AdminProductUpdate,
    CreateCategoryRequest,
    UpdateCategoryRequest,
    BranchSettings,
    // Attribute definitions/values (local types)
    // DashboardStats, // Unused
    TenantFeaturesUpdate,
    SuperTenantDTO,
    SuperBranchDTO,
    SuperDomainsResponseDTO,
    ThemeV1,
    // Super Admin Types could be added here if available, for now using inline exact shapes matches
} from "@vendora/contracts";
import type {
    AttributeDefinition,
    AttributeDefinitionCreate,
    AttributeDefinitionUpdate,
    AttributeValue,
    AttributeValueCreate,
    AttributeValueUpdate,
} from "@/lib/admin-attributes";

import { ACCESS_DENIED_MESSAGE } from "./actions-constants";

// Local Aliases for Inferred Types
type AdminOrders = Awaited<ReturnType<typeof getAdminOrders>>;
type AdminMenu = Awaited<ReturnType<typeof getAdminMenu>>;
type BranchSettingsResult = Awaited<ReturnType<typeof getBranchSettings>>;
type DashboardStatsResult = Awaited<ReturnType<typeof getDashboardStats>>;
type BranchConfigResult = Awaited<ReturnType<typeof getBranchConfig>>;

async function catch403<T>(fn: () => Promise<T>): Promise<T> {
    try {
        return await fn();
    } catch (e) {
        if (e instanceof FetchJsonError && e.status === 403) {
            throw new Error(ACCESS_DENIED_MESSAGE);
        }
        throw e;
    }
}

export async function getAdminOrdersAction(branchSlug: string, tenantSlug: string): Promise<AdminOrders> {
    return catch403(() => getAdminOrders(branchSlug, tenantSlug));
}

export async function getAdminMenuAction(branchSlug: string, tenantSlug: string): Promise<AdminMenu> {
    return catch403(() => getAdminMenu(branchSlug, tenantSlug));
}

export async function getAttributeDefinitionsAction(tenantSlug: string): Promise<AttributeDefinition[]> {
    return catch403(() => import("@/lib/server/mutations").then(m => m.getAttributeDefinitions(tenantSlug)));
}

export async function createAttributeDefinitionAction(tenantSlug: string, data: AttributeDefinitionCreate): Promise<AttributeDefinition> {
    return import("@/lib/server/mutations").then(m => m.createAttributeDefinition(tenantSlug, data));
}

export async function updateAttributeDefinitionAction(tenantSlug: string, id: string, data: AttributeDefinitionUpdate): Promise<AttributeDefinition> {
    return import("@/lib/server/mutations").then(m => m.updateAttributeDefinition(tenantSlug, id, data));
}

export async function deleteAttributeDefinitionAction(tenantSlug: string, id: string): Promise<{ ok: true }> {
    return import("@/lib/server/mutations").then(m => m.deleteAttributeDefinition(tenantSlug, id));
}

export async function getAttributeValuesAction(tenantSlug: string, query?: {
    itemId?: string;
    definitionId?: string;
    valueString?: string;
    valueNumber?: number;
    valueBool?: boolean;
    valueDate?: string;
}): Promise<AttributeValue[]> {
    return catch403(() => import("@/lib/server/mutations").then(m => m.getAttributeValues(tenantSlug, query)));
}

export async function createAttributeValueAction(tenantSlug: string, data: AttributeValueCreate): Promise<AttributeValue> {
    return import("@/lib/server/mutations").then(m => m.createAttributeValue(tenantSlug, data));
}

export async function updateAttributeValueAction(tenantSlug: string, id: string, data: AttributeValueUpdate): Promise<AttributeValue> {
    return import("@/lib/server/mutations").then(m => m.updateAttributeValue(tenantSlug, id, data));
}

export async function deleteAttributeValueAction(tenantSlug: string, id: string): Promise<{ ok: true }> {
    return import("@/lib/server/mutations").then(m => m.deleteAttributeValue(tenantSlug, id));
}

export async function getBranchSettingsAction(branchSlug: string, tenantSlug: string): Promise<BranchSettingsResult> {
    return catch403(() => getBranchSettings(branchSlug, tenantSlug));
}

export async function getDashboardStatsAction(branchSlug: string, tenantSlug: string): Promise<DashboardStatsResult> {
    return catch403(() => getDashboardStats(branchSlug, tenantSlug));
}

export async function getBranchConfigAction(branchSlug: string, tenantSlug: string): Promise<BranchConfigResult> {
    return await getBranchConfig(branchSlug, tenantSlug);
}

/** ACCESS_LEVELS Phase 6.1: Current user admin context for menu (role, permissions, enabled module IDs). Returns null if not admin/403. */
export async function getAdminMeAction(tenantSlug: string): Promise<AdminMeResponse | null> {
    return getAdminMe(tenantSlug);
}

/** ACCESS_LEVELS Phase 5: Tenant members (owner only). Returns null on 403 (non-owner). */
export async function getAdminUsersAction(tenantSlug: string): Promise<AdminUsersResponse | null> {
    try {
        return await getAdminUsers(tenantSlug);
    } catch (e) {
        if (e instanceof FetchJsonError && e.status === 403) return null;
        throw e;
    }
}

/** ACCESS_LEVELS Phase 5: List branches for tenant (owner only). Returns null on 403. */
export async function getAdminBranchesAction(tenantSlug: string): Promise<AdminBranchesResponse | null> {
    try {
        return await getAdminBranches(tenantSlug);
    } catch (e) {
        if (e instanceof FetchJsonError && e.status === 403) return null;
        throw e;
    }
}

export async function addTenantMemberAction(
    tenantSlug: string,
    data: { email: string; role: "TENANT_OWNER" | "TENANT_ADMIN"; permissions?: Record<string, TenantMemberPermissionInput> }
) {
    const { addTenantMember } = await import("@/lib/server/mutations");
    return addTenantMember(tenantSlug, data);
}

export async function updateTenantMemberAction(
    tenantSlug: string,
    userId: string,
    data: { role?: "TENANT_OWNER" | "TENANT_ADMIN"; permissions?: Record<string, TenantMemberPermissionInput> }
) {
    const { updateTenantMember } = await import("@/lib/server/mutations");
    return updateTenantMember(tenantSlug, userId, data);
}

export async function removeTenantMemberAction(tenantSlug: string, userId: string) {
    const { removeTenantMember } = await import("@/lib/server/mutations");
    return removeTenantMember(tenantSlug, userId);
}



// ============================================
// SUPER ADMIN ACTIONS
// ============================================

// ============================================
// SUPER ADMIN ACTIONS
// ============================================

// TODO: Phase 1G - Audit tenant-context requirements for fetchWithAuth callers; ensure tenant-scoped actions use lib/data.ts to guarantee isolation.
// Helper Removed: Replaced by apiJsonWithAuth

const BFF = getBffBaseUrl();

export async function getSuperTenantsAction() {
    return await apiJsonWithAuth<SuperTenantDTO[]>(`${BFF}/super/tenants`);
}

export async function getSuperTenantByIdAction(id: string): Promise<SuperTenantDTO | null> {
    try {
        return await apiJsonWithAuth<SuperTenantDTO>(`${BFF}/super/tenants/${id}`);
    } catch (e) {
        if (e instanceof HttpError && e.status === 404) return null;
        throw e;
    }
}

export async function createTenantAction(data: {
    name: string;
    slug: string;
    adminEmail: string;
    adminPassword: string;
}) {
    // Delegated to mutations.ts
    const { createTenant } = await import("@/lib/server/mutations");
    return createTenant(data);
}

export async function toggleTenantAction(id: string, tenantSlug: string) {
    const { toggleTenant } = await import("@/lib/server/mutations");
    const res = await toggleTenant(id);
    revalidateTag(tenantTag(tenantSlug));
    return res;
}

export async function deleteTenantAction(id: string) {
    const { deleteTenant } = await import("@/lib/server/mutations");
    return deleteTenant(id);
}

export async function updateTenantAction(id: string, data: {
    name?: string;
    slug?: string;
    isActive?: boolean;
    countryCode?: string;
    currency?: string;
    features?: TenantFeaturesUpdate;
}, tenantSlugs?: string[]) {
    const { updateTenant } = await import("@/lib/server/mutations");
    const res = await updateTenant(id, data);
    for (const slug of new Set((tenantSlugs ?? []).filter(Boolean))) {
        revalidateTag(tenantTag(slug));
    }
    revalidatePath("/super-admin");
    return res;
}

export async function updateTenantThemeAction(tenantId: string, tenantSlugs: string[], theme: ThemeV1): Promise<void> {
    const { updateTenantTheme } = await import("@/lib/server/mutations");
    await updateTenantTheme(tenantId, theme);
    for (const s of new Set(tenantSlugs.filter(Boolean))) {
        revalidateTag(tenantTag(s));
    }
    revalidatePath("/super-admin");
}

export async function updateTenantMainTemplateAction(tenantId: string, mainTemplate: string): Promise<{
    tenantId: string;
    tenantSlug: string;
    mainTemplate: string;
}> {
    const { updateTenantMainTemplate } = await import("@/lib/server/mutations");
    const res = await updateTenantMainTemplate(tenantId, mainTemplate);
    revalidateTag(tenantTag(res.tenantSlug));
    revalidatePath("/super-admin");
    return res;
}

export async function getDomainsAction(tenantId: string) {
    return await apiJsonWithAuth<SuperDomainsResponseDTO>(`${BFF}/super/tenants/${tenantId}/domains`);
}

export async function getTenantBranchesAction(tenantId: string) {
    return await apiJsonWithAuth<SuperBranchDTO[]>(`${BFF}/super/tenants/${tenantId}/branches`);
}

type SuperPaymentProviderRow = {
    id: string;
    tenantId: string;
    type: "MOLLIE" | "MONOBANK" | "LIQPAY";
    mode: "TEST" | "LIVE";
    status: "ACTIVE" | "DISABLED";
    credentialsRef: string | null;
    config: Record<string, unknown> | null;
    createdAt?: string;
    updatedAt?: string;
};

export async function getPaymentProvidersAction(tenantId: string): Promise<{ items: SuperPaymentProviderRow[] }> {
    return await apiJsonWithAuth<{ items: SuperPaymentProviderRow[] }>(`${BFF}/super/tenants/${tenantId}/payment-providers`);
}

export async function createPaymentProviderAction(tenantId: string, data: {
    type: SuperPaymentProviderRow["type"];
    mode: SuperPaymentProviderRow["mode"];
    status?: SuperPaymentProviderRow["status"];
    credentialsRef?: string | null;
    config?: Record<string, unknown> | null;
}): Promise<SuperPaymentProviderRow> {
    return await apiJsonWithAuth<SuperPaymentProviderRow>(`${BFF}/super/tenants/${tenantId}/payment-providers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
}

export async function rotatePaymentProviderWebhookTokenAction(tenantId: string, providerId: string, args?: {
    keepPrevious?: boolean;
}): Promise<{ ok: true; provider: SuperPaymentProviderRow; newToken: string }> {
    return await apiJsonWithAuth<{ ok: true; provider: SuperPaymentProviderRow; newToken: string }>(
        `${BFF}/super/tenants/${tenantId}/payment-providers/${providerId}/webhook-token/rotate`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ keepPrevious: args?.keepPrevious }),
        }
    );
}

export async function refreshMonobankPaymentProviderPubkeyAction(tenantId: string, providerId: string): Promise<{ ok: true; updated: true; providerId: string }> {
    return await apiJsonWithAuth<{ ok: true; updated: true; providerId: string }>(
        `${BFF}/super/tenants/${tenantId}/payment-providers/${providerId}/monobank/refresh-pubkey`,
        {
            method: "POST",
        }
    );
}

export async function patchPaymentProviderAction(
    tenantId: string,
    providerId: string,
    data: Partial<Pick<SuperPaymentProviderRow, "status" | "credentialsRef" | "config">>
): Promise<SuperPaymentProviderRow> {
    return await apiJsonWithAuth<SuperPaymentProviderRow>(
        `${BFF}/super/tenants/${tenantId}/payment-providers/${providerId}`,
        {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        }
    );
}

export async function createBranchAction(tenantId: string, data: {
    name: string;
    slug: string;
    cityName: string;
    address: string;
    phone: string;
}, tenantSlug: string) {
    const { createBranch } = await import("@/lib/server/mutations");
    const res = await createBranch(tenantId, data);
    revalidateTag(tenantTag(tenantSlug));
    return res;
}

export async function updateBranchAction(
    tenantId: string,
    branchId: string,
    data: Partial<{
        slug: string;
        cityName: string;
        address: string;
        phones: string[];
    }>,
    tenantSlug: string
) {
    const { updateBranch } = await import("@/lib/server/mutations");
    const res = await updateBranch(tenantId, branchId, data);
    revalidateTag(tenantTag(tenantSlug));
    return res;
}

// ============================================
// UPLOAD ACTION
// ============================================

export async function uploadFileAction(formData: FormData, tenantSlug: string) {
    const { uploadFile } = await import("@/lib/server/mutations");
    return uploadFile(formData, tenantSlug);
}

import { revalidatePath } from "next/cache";
import { tenantTag, revalidateTag, menuTag, menuTenantTag } from "@/lib/cache/tagSlug";

// Helper to maintain tenant context (aligned with AdminNavigation)
function makeRoot(tenantSlug: string | undefined, branchSlug: string) {
    return tenantSlug ? `/t/${tenantSlug}/${branchSlug}` : `/${branchSlug}`;
}

function revalidateMenuCache(tenantSlug: string, branchSlug: string) {
    const locales = tenantSlug === "berlin-press"
        ? [undefined, "de", "en"]
        : [undefined];
    for (const locale of locales) {
        revalidateTag(menuTenantTag(tenantSlug, locale));
        if (branchSlug) revalidateTag(menuTag(tenantSlug, branchSlug, locale));
    }
}

export async function updateOrderStatusAction(branchSlug: string, orderId: string, newStatus: string, tenantSlug: string) {
    // Direct apiJsonWithAuth ensures AppErrors are thrown, not swallowed.
    await import("@/lib/server/mutations").then(m => m.updateAdminOrderStatus(branchSlug, tenantSlug, orderId, newStatus));

    const root = makeRoot(tenantSlug, branchSlug);
    revalidatePath(`${root}/admin`);
    return true;
}

export async function rescheduleOrderAction(branchSlug: string, orderId: string, newDeliveryTime: string, tenantSlug: string) {
    const res = await apiJsonWithAuthTenant<{ success: boolean; message?: string }>(`${BFF}/admin/${branchSlug}/orders/${orderId}/reschedule`, tenantSlug, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newDeliveryTime }),
    });
    if (res.success) {
        const root = makeRoot(tenantSlug, branchSlug);
        revalidatePath(`${root}/admin/orders`);
    }
    return res;
}

export async function createProductAction(branchSlug: string, data: AdminProductCreate, tenantSlug: string) {
    const res = await import("@/lib/server/mutations").then(m => m.createProduct(branchSlug, tenantSlug, data));
    if (res) {
        const root = makeRoot(tenantSlug, branchSlug);
        revalidatePath(`${root}/admin/menu`);
        revalidateMenuCache(tenantSlug, branchSlug);
    }
    return res;
}

export async function updateProductAction(branchSlug: string, id: string, data: AdminProductUpdate, tenantSlug: string) {
    const res = await import("@/lib/server/mutations").then(m => m.updateProduct(branchSlug, tenantSlug, id, data));
    const root = makeRoot(tenantSlug, branchSlug);
    if (res) {
        revalidatePath(`${root}/admin/menu`);
        revalidateMenuCache(tenantSlug, branchSlug);
    }
    return res;
}

export async function toggleProductAction(branchSlug: string, id: string, isAvailable: boolean, tenantSlug: string) {
    const res = await import("@/lib/server/mutations").then(m => m.toggleProductAvailability(branchSlug, tenantSlug, id, isAvailable));
    if (res) {
        const root = makeRoot(tenantSlug, branchSlug);
        revalidatePath(`${root}/admin/menu`);
        revalidatePath(`${root}/menu`);
        revalidateMenuCache(tenantSlug, branchSlug);
    }
    return res;
}

export async function deleteProductAction(branchSlug: string, id: string, tenantSlug: string) {
    const res = await import("@/lib/server/mutations").then(m => m.deleteProduct(branchSlug, tenantSlug, id));
    if (res) {
        const root = makeRoot(tenantSlug, branchSlug);
        revalidatePath(`${root}/admin/menu`);
        revalidatePath(`${root}/menu`);
        revalidateMenuCache(tenantSlug, branchSlug);
    }
    return res;
}

export async function createCategoryAction(branchSlug: string, data: CreateCategoryRequest, tenantSlug: string) {
    const res = await import("@/lib/server/mutations").then(m => m.createCategory(branchSlug, tenantSlug, data));
    const root = makeRoot(tenantSlug, branchSlug);
    if (res) {
        revalidatePath(`${root}/admin/menu`);
        revalidateMenuCache(tenantSlug, branchSlug);
    }
    return res;
}

export async function updateCategoryAction(branchSlug: string, id: string, data: UpdateCategoryRequest, tenantSlug: string) {
    const res = await import("@/lib/server/mutations").then(m => m.updateCategory(branchSlug, tenantSlug, id, data));
    if (res) {
        const root = makeRoot(tenantSlug, branchSlug);
        revalidatePath(`${root}/admin/menu`);
        revalidatePath(`${root}/menu`);
        revalidateMenuCache(tenantSlug, branchSlug);
    }
    return res;
}

export async function deleteCategoryAction(branchSlug: string, id: string, tenantSlug: string) {
    const res = await import("@/lib/server/mutations").then(m => m.deleteCategory(branchSlug, tenantSlug, id));
    if (res) {
        const root = makeRoot(tenantSlug, branchSlug);
        revalidatePath(`${root}/admin/menu`);
        revalidatePath(`${root}/menu`);
        revalidateMenuCache(tenantSlug, branchSlug);
    }
    return res;
}

export async function toggleCategoryAction(branchSlug: string, id: string, isAvailable: boolean, tenantSlug: string) {
    const res = await import("@/lib/server/mutations").then(m => m.toggleCategoryAvailability(branchSlug, tenantSlug, id, isAvailable));
    if (res) {
        const root = makeRoot(tenantSlug, branchSlug);
        revalidatePath(`${root}/admin/menu`);
        revalidatePath(`${root}/menu`);
        revalidateMenuCache(tenantSlug, branchSlug);
    }
    return res;
}

export async function reorderCategoriesAction(branchSlug: string, ids: string[], tenantSlug: string) {
    const res = await import("@/lib/server/mutations").then(m => m.reorderCategories(branchSlug, tenantSlug, ids));
    if (res) {
        const root = makeRoot(tenantSlug, branchSlug);
        revalidatePath(`${root}/admin/menu`);
        revalidatePath(`${root}/menu`);
        revalidateMenuCache(tenantSlug, branchSlug);
    }
    return res;
}

export async function revalidateMenuCacheAction(tenantSlug: string, branchSlug: string) {
    revalidateMenuCache(tenantSlug, branchSlug);
}

export async function updateBranchSettingsAction(branchSlug: string, data: Partial<BranchSettings>, tenantSlug: string) {
    const res = await import("@/lib/server/mutations").then(m => m.updateBranchSettings(branchSlug, tenantSlug, data));
    if (res) {
        const root = makeRoot(tenantSlug, branchSlug);
        revalidatePath(`${root}/admin`); // Revalidate admin layout if it shows active status
        revalidatePath(`${root}`); // Public home/footer
        revalidatePath(`${root}/menu`); // Menu page
        revalidateTag(tenantTag(tenantSlug));
    }
    return res;
}

export async function getAdminContentAction(tenantSlug: string) {
    return await import("@/lib/server/mutations").then(m => m.getAdminContent(tenantSlug));
}

export async function updateAdminContentAction(branchSlug: string, tenantSlug: string, amContent: import("@/lib/am-content").AmContentV1 | null) {
    const res = await import("@/lib/server/mutations").then(m => m.updateAdminContent(tenantSlug, amContent));
    if (res) {
        const root = makeRoot(tenantSlug, branchSlug);
        revalidateTag(tenantTag(tenantSlug));
        revalidatePath(`${root}/admin/content`);
        revalidatePath(`${root}/main`);
    }
    return res;
}

export async function getAdminJournalListAction(tenantSlug: string, args?: { cursor?: string; limit?: number; status?: "DRAFT" | "PUBLISHED" }) {
    return await import("@/lib/server/mutations").then(m => m.getAdminJournalList(tenantSlug, args));
}

export async function getAdminJournalPostAction(tenantSlug: string, id: string) {
    return await import("@/lib/server/mutations").then(m => m.getAdminJournalPost(tenantSlug, id));
}

export async function createAdminJournalDraftAction(tenantSlug: string, data: { slug?: string; coverImageKey?: string | null; translations: import("@/lib/server/mutations").JournalTranslationInput[] }) {
    const res = await import("@/lib/server/mutations").then(m => m.createAdminJournalDraft(tenantSlug, data));
    if (res) {
        revalidatePath(`/t/${tenantSlug}/journal`);
    }
    return res;
}

export async function patchAdminJournalDraftAction(tenantSlug: string, id: string, data: { slug?: string; coverImageKey?: string | null; translations?: import("@/lib/server/mutations").JournalTranslationInput[] }) {
    const res = await import("@/lib/server/mutations").then(m => m.patchAdminJournalDraft(tenantSlug, id, data));
    if (res) {
        revalidatePath(`/t/${tenantSlug}/journal`);
    }
    return res;
}

export async function deleteAdminJournalDraftAction(tenantSlug: string, id: string) {
    const res = await import("@/lib/server/mutations").then(m => m.deleteAdminJournalDraft(tenantSlug, id));
    if (res) {
        revalidatePath(`/t/${tenantSlug}/journal`);
    }
    return res;
}

export async function publishAdminJournalPostAction(tenantSlug: string, id: string) {
    const res = await import("@/lib/server/mutations").then(m => m.publishAdminJournalPost(tenantSlug, id));
    if (res?.slug) {
        revalidatePath(`/t/${tenantSlug}/journal`);
        revalidatePath(`/t/${tenantSlug}/journal/${res.slug}`);
        // Custom-domain canonical paths
        revalidatePath(`/journal`);
        revalidatePath(`/journal/${res.slug}`);
    }
    return res;
}

export async function unpublishAdminJournalPostAction(tenantSlug: string, id: string) {
    const res = await import("@/lib/server/mutations").then(m => m.unpublishAdminJournalPost(tenantSlug, id));
    if (res?.slug) {
        revalidatePath(`/t/${tenantSlug}/journal`);
        revalidatePath(`/t/${tenantSlug}/journal/${res.slug}`);
        // Custom-domain canonical paths
        revalidatePath(`/journal`);
        revalidatePath(`/journal/${res.slug}`);
    }
    return res;
}

export async function setAdminJournalHomeSlotAction(tenantSlug: string, id: string, homeSlot: number | null) {
    const res = await import("@/lib/server/mutations").then(m => m.setAdminJournalHomeSlot(tenantSlug, id, homeSlot));
    if (res?.id) {
        revalidatePath(`/t/${tenantSlug}/main`);
        // Custom-domain canonical path
        revalidatePath(`/`);
        // Keep admin list/editor fresh
        revalidatePath(`/t/${tenantSlug}/journal`);
    }
    return res;
}

export async function renderJournalMarkdownPreviewAction(markdown: string): Promise<string> {
    if (typeof markdown !== "string") throw new Error("Invalid markdown");
    if (markdown.length > 200_000) throw new Error("Markdown too large for preview");
    const { renderJournalMarkdownToHtml } = await import("@vendora/shared");
    return await renderJournalMarkdownToHtml(markdown);
}



import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function loginAction(prevState: unknown, formData: FormData) {
    const branchSlug = formData.get("branchSlug") as string;
    const tenantSlugRaw = formData.get("tenantSlug");
    const tenantSlug = typeof tenantSlugRaw === "string" && tenantSlugRaw.length > 0 ? tenantSlugRaw : undefined;
    const username = formData.get("username") as string;
    const password = formData.get("password") as string;

    const BFF = getBffBaseUrl();

    try {
        await apiJson<unknown>(`${BFF}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
            onResponse: async (res) => {
                const cookieHeader = res.headers.get("set-cookie");
                if (cookieHeader) {
                    const match = cookieHeader.match(/auth_token=([^;]+)/);
                    if (match && match[1]) {
                        const token = match[1];
                        (await cookies()).set("auth_token", token, {
                            httpOnly: true,
                            secure: process.env.NODE_ENV === "production",
                            path: "/",
                            maxAge: 12 * 60 * 60
                        });
                    }
                }
            }
        });
    } catch (error) {
        console.error("Login error:", error);
        return { error: "An error occurred during login" };
    }

    if (branchSlug) {
        const root = makeRoot(tenantSlug, branchSlug);
        redirect(`${root}/admin`);
    }
}

export async function superLoginAction(prevState: unknown, formData: FormData) {
    const username = formData.get("username") as string;
    const password = formData.get("password") as string;

    const BFF = getBffBaseUrl();

    try {
        await apiJson<unknown>(`${BFF}/auth/super-login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
            onResponse: async (res) => {
                // Extract auth token from Set-Cookie header
                const cookieHeader = res.headers.get("set-cookie");
                if (cookieHeader) {
                    const match = cookieHeader.match(/auth_token=([^;]+)/);
                    if (match && match[1]) {
                        const token = match[1];
                        (await cookies()).set("auth_token", token, {
                            httpOnly: true,
                            secure: process.env.NODE_ENV === "production",
                            sameSite: "strict",
                            path: "/",
                            maxAge: 7 * 24 * 3600
                        });
                    }
                }
            }
        });

        redirect("/super-admin");
    } catch (error: unknown) {
        // Re-throw redirect errors (they're not actual errors)
        const digest = (error as { digest?: string })?.digest;
        if (digest?.startsWith('NEXT_REDIRECT')) {
            throw error;
        }

        // Handle explicit AppError
        if (isAppError(error)) {
            // Result Policy: Return pure object, do NOT throw
            return { error: error.message };
        }
        // Handle Error wrapper from apiJson
        if (error instanceof Error) {
            return { error: error.message };
        }

        console.error("Super admin login error:", error);
        return { error: "An error occurred during login" };
    }
}

export async function logoutAction(branchSlug: string, tenantSlug?: string) {
    (await cookies()).delete("auth_token");
    const root = makeRoot(tenantSlug, branchSlug); // makeRoot now returns /t/...
    redirect(`${root}/admin/login`);
}
// ============================================
// PHASE 5: MARKETING
// ============================================

// import { revalidateTag } from "next/cache"; // Unused

export async function toggleFavoriteAction(productId: string, tenantSlug: string) {
    const res = await apiJsonWithAuthTenant<unknown>(`${BFF}/favorites/${productId}`, tenantSlug, {
        method: "POST"
    });
    // We might want to revalidate favorites list
    revalidatePath(`/t/${tenantSlug}/profile/favorites`);
    return res;
}

export async function getFavoritesAction(tenantSlug: string) {
    return await apiJsonWithAuthTenant<{ favorites: unknown[] }>(`${BFF}/favorites`, tenantSlug, {
        next: { tags: ["favorites"] }
    });
}

export async function reorderAction(orderId: string, tenantSlug: string) {
    const data = await apiJsonWithAuthTenant<unknown>(`${BFF}/orders/${orderId}/repeat`, tenantSlug, {
        method: "POST"
    });
    return zReorderResponse.parse(data);
}
