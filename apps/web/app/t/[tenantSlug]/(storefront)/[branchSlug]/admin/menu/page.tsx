"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
    getAdminMenuAction,
    createProductAction,
    updateProductAction,
    toggleProductAction,
    deleteProductAction,
    createCategoryAction,
    updateCategoryAction,
    deleteCategoryAction,
    toggleCategoryAction,
    reorderCategoriesAction,
    uploadFileAction,
    getAttributeDefinitionsAction,
    createAttributeDefinitionAction,
    updateAttributeDefinitionAction,
    deleteAttributeDefinitionAction,
    getAttributeValuesAction,
    createAttributeValueAction,
    updateAttributeValueAction,
    deleteAttributeValueAction,
    revalidateMenuCacheAction,
} from "@/app/actions";
import { ACCESS_DENIED_MESSAGE } from "@/app/actions-constants";
import { AccessDeniedBlock } from "../AccessDeniedBlock";
import { formatPrice } from "@/lib/format";
import { MenuResponse, CreateProductRequest, UpdateProductRequest } from "@vendora/contracts";
import { useAdminContext } from "../AdminContext";
import { Modal } from "@/components/ui/Modal";
import { useThemeOptional } from "@/lib/theme/client";
import { getThemedInput } from "@/lib/components/input-registry";
import { getThemedSelect } from "@/lib/components/select-registry";
import { getThemedTextarea } from "@/lib/components/textarea-registry";
import { getThemedButton } from "@/lib/components/button-registry";
import type { AttributeDefinition, AttributeValueType } from "@/lib/admin-attributes";

const MODULE_ID = "admin_catalog_menu";

type BerlinFieldGroup = "localized" | "metadata" | "availability";
type BerlinFieldConfig = {
    key: string;
    label: string;
    valueType: AttributeValueType;
    input: "text" | "textarea" | "number" | "checkbox" | "date" | "select";
    group: BerlinFieldGroup;
    placeholder?: string;
    helper?: string;
    options?: Array<{ value: string; label: string }>;
};

const BERLIN_FIELDS: BerlinFieldConfig[] = [
    // Localized content
    { key: "title_de", label: "Title (DE)", valueType: "STRING", input: "text", group: "localized" },
    { key: "title_en", label: "Title (EN)", valueType: "STRING", input: "text", group: "localized" },
    { key: "author_de", label: "Author (DE)", valueType: "STRING", input: "text", group: "localized" },
    { key: "author_en", label: "Author (EN)", valueType: "STRING", input: "text", group: "localized" },
    { key: "desc_de", label: "Description (DE)", valueType: "STRING", input: "textarea", group: "localized" },
    { key: "desc_en", label: "Description (EN)", valueType: "STRING", input: "textarea", group: "localized" },
    // Metadata
    { key: "year", label: "Release year", valueType: "NUMBER", input: "number", group: "metadata" },
    { key: "pages", label: "Pages", valueType: "NUMBER", input: "number", group: "metadata" },
    { key: "old_price", label: "Old price", valueType: "NUMBER", input: "number", group: "metadata" },
    { key: "isbn", label: "ISBN", valueType: "STRING", input: "text", group: "metadata" },
    { key: "publisher", label: "Publisher", valueType: "STRING", input: "text", group: "metadata" },
    { key: "dimensions", label: "Dimensions", valueType: "STRING", input: "text", group: "metadata", placeholder: "140x210mm" },
    { key: "genre", label: "Genres", valueType: "STRING", input: "text", group: "metadata", placeholder: "Poetry, History" },
    { key: "badges", label: "Badges", valueType: "STRING", input: "text", group: "metadata", placeholder: "new, bestseller" },
    {
        key: "format",
        label: "Format",
        valueType: "STRING",
        input: "select",
        group: "metadata",
        options: [
            { value: "", label: "—" },
            { value: "hardcover", label: "Hardcover" },
            { value: "paperback", label: "Paperback" },
            { value: "digital", label: "Digital" },
            { value: "special_edition", label: "Special edition" },
        ],
    },
    { key: "age_rating", label: "Age rating", valueType: "STRING", input: "text", group: "metadata", placeholder: "16+" },
    { key: "release_date", label: "Release date", valueType: "DATE", input: "date", group: "metadata" },
    {
        key: "type",
        label: "Type",
        valueType: "STRING",
        input: "select",
        group: "metadata",
        options: [
            { value: "", label: "—" },
            { value: "publisher", label: "Publisher" },
            { value: "author_project", label: "Author project" },
        ],
    },
    // Availability
    { key: "stock", label: "Stock", valueType: "NUMBER", input: "number", group: "availability" },
    { key: "preorder", label: "Preorder", valueType: "BOOL", input: "checkbox", group: "availability" },
];

export default function AdminMenuPage({ params }: { params: Promise<{ tenantSlug: string; branchSlug: string }> }) {
    const { canEdit } = useAdminContext();
    const canEditMenu = canEdit(MODULE_ID);
    const canEditFields = canEdit("admin_catalog_attribute_definitions");
    const theme = useThemeOptional();
    const componentSet = theme?.componentSet ?? "default";
    const [menu, setMenu] = useState<MenuResponse | null>(null);
    const [dbCategories, setDbCategories] = useState<MenuResponse['categories']>([]);
    const [branchSlug, setBranchSlug] = useState("");
    const [tenantSlug, setTenantSlug] = useState("");
    const isBerlin = tenantSlug === "berlin-press";

    // UI State
    const [showModal, setShowModal] = useState<"create_product" | "edit_product" | "manage_categories" | "manage_fields" | null>(null);
    const [editingProduct, setEditingProduct] = useState<MenuResponse['items'][number] | null>(null);
    const [loading, setLoading] = useState(true);
    const [isPending, startTransition] = useTransition();
    const [accessDenied, setAccessDenied] = useState(false);

    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        params.then(p => {
            setBranchSlug(p.branchSlug);
            setTenantSlug(p.tenantSlug);
            load(p.branchSlug, p.tenantSlug);
        });
    }, [params]);

    async function load(slug: string, ts: string) {
        setLoading(true);
        setError(null);
        setAccessDenied(false);
        try {
            const menuData = await getAdminMenuAction(slug, ts);
            setMenu(menuData);
            setDbCategories(menuData.categories);
        } catch (e: unknown) {
            if (e instanceof Error && e.message === ACCESS_DENIED_MESSAGE) {
                setAccessDenied(true);
            } else {
                console.error("Menu Load Failed:", e);
                setError(e instanceof Error ? e.message : "Failed to load menu");
            }
        } finally {
            setLoading(false);
        }
    }

    const categories = dbCategories.length > 0 ? dbCategories : (menu?.categories || []);
    const Button = getThemedButton({ componentSet, tenantOverrideKey: tenantSlug });

    const handleToggle = (id: string, current: boolean) => {
        if (!confirm(`Are you sure you want to ${current ? 'hide' : 'show'} this item?`)) return;
        startTransition(async () => {
            startTransition(async () => {
                await toggleProductAction(branchSlug, id, !current, tenantSlug);
                load(branchSlug, tenantSlug);
            });
        });
    };

    const handleDelete = (id: string) => {
        if (!confirm("Delete this product permanently?")) return;
        startTransition(async () => {
            startTransition(async () => {
                await deleteProductAction(branchSlug, id, tenantSlug);
                load(branchSlug, tenantSlug);
            });
        });
    };

    const openEdit = (item: MenuResponse['items'][number]) => {
        setEditingProduct(item);
        setShowModal("edit_product");
    };

    if (accessDenied) return <AccessDeniedBlock />;

    return (
        <div>
            {!canEditMenu && (
                <div className="bg-warning-weak text-warning" style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 20, fontSize: 14 }}>
                    Read-only: you can view the menu but not edit it.
                </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h2>{isBerlin ? "Catalog Management" : "Menu Management"}</h2>
                {canEditMenu && (
                    <div style={{ display: "flex", gap: 10 }}>
                        {isBerlin && canEditFields && (
                            <Button variant="outline" onClick={() => setShowModal("manage_fields")}>
                                Manage Fields
                            </Button>
                        )}
                        <Button variant="primary" onClick={() => setShowModal("manage_categories")}>
                            {isBerlin ? "Manage Collections" : "Manage Categories"}
                        </Button>
                        <Button variant="primary" onClick={() => setShowModal("create_product")}>
                            {isBerlin ? "+ Add New Book" : "+ Add New Dish"}
                        </Button>
                    </div>
                )}
            </div>

            {loading && <div style={{ padding: 20, textAlign: "center", color: "var(--muted)" }}>Loading Menu...</div>}

            {error && (
                <div className="bg-danger-weak text-danger" style={{ padding: 20, borderRadius: 8, marginBottom: 20, fontWeight: "bold" }}>
                    Error: {error} <br />
                    <small>Please check server logs or data integrity.</small>
                    <Button variant="outline" onClick={() => load(branchSlug, tenantSlug)} style={{ marginLeft: 10, fontSize: 12 }}>Retry</Button>
                </div>
            )}

            {categories.length === 0 && !loading && !error && (
                <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", border: "2px dashed var(--line)", borderRadius: 8 }}>
                    <h3>{isBerlin ? "No Catalog Items Found" : "No Menu Items Found"}</h3>
                    <p>{isBerlin ? "Create a collection and add your first book!" : "Create a category and add your first dish!"}</p>
                </div>
            )}

            {categories.map(cat => (
                <div key={cat.id} style={{ marginBottom: 30 }}>
                    <h3 style={{ borderBottom: "1px solid var(--line)", paddingBottom: 10, display: "flex", justifyContent: "space-between", opacity: cat.isAvailable ? 1 : 0.5 }}>
                        <span>
                            {cat.title}
                            {!cat.isAvailable && <span style={{ marginLeft: 10, fontSize: 10, background: "var(--line)", color: "var(--ink)", padding: "2px 4px", borderRadius: 4 }}>HIDDEN</span>}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 400, color: "var(--muted)" }}>ID: {cat.id}</span>
                    </h3>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20, marginTop: 10 }}>
                        {menu?.items
                            .filter(i => i.categoryId === cat.id)
                            .map(item => (
                                <div key={item.id} style={{ border: "1px solid var(--line)", padding: 12, borderRadius: 8, background: item.isAvailable ? "var(--paper)" : "var(--bg)", opacity: item.isAvailable ? 1 : 0.7 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                                        <div style={{ fontWeight: 800 }}>{item.title}</div>
                                        <div className="text-success">
                                            {formatPrice(item.price, true)} {isBerlin ? "€" : "грн"}
                                        </div>
                                    </div>
                                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{item.desc || "No description"}</div>

                                    {canEditMenu && (
                                        <div style={{ marginTop: 12, display: "flex", gap: 8, fontSize: 13 }}>
                                            <Button variant="outline" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => openEdit(item)}>
                                                Edit
                                            </Button>
                                            <Button
                                                className={`${item.isAvailable ? 'bg-warning' : 'bg-success'}`}
                                                style={{ padding: "4px 8px", fontSize: 12 }}
                                                onClick={() => handleToggle(item.id, !!item.isAvailable)}
                                                disabled={isPending}
                                            >
                                                {item.isAvailable ? "Hide" : "Show"}
                                            </Button>
                                            <Button
                                                className="bg-danger"
                                                style={{ padding: "4px 8px", fontSize: 12 }}
                                                onClick={() => handleDelete(item.id)}
                                                disabled={isPending}
                                            >
                                                Delete
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            ))}
                    </div>
                </div>
            ))}

            {showModal === "create_product" && (
                <ProductModal
                    mode="create"
                    branchSlug={branchSlug}
                    tenantSlug={tenantSlug}
                    categories={categories}
                    onClose={() => setShowModal(null)}
                    onSuccess={() => { setShowModal(null); load(branchSlug, tenantSlug); }}
                />
            )}

            {showModal === "edit_product" && editingProduct && (
                <ProductModal
                    mode="edit"
                    initialData={editingProduct}
                    branchSlug={branchSlug}
                    tenantSlug={tenantSlug}
                    categories={categories}
                    onClose={() => setShowModal(null)}
                    onSuccess={() => { setShowModal(null); load(branchSlug, tenantSlug); }}
                />
            )}

            {showModal === "manage_categories" && (
                <CategoryManager
                    branchSlug={branchSlug}
                    tenantSlug={tenantSlug}
                    categories={categories}
                    onClose={() => setShowModal(null)}
                    onSuccess={() => load(branchSlug, tenantSlug)}
                />
            )}

            {showModal === "manage_fields" && isBerlin && (
                <AttributeDefinitionManager
                    tenantSlug={tenantSlug}
                    onClose={() => setShowModal(null)}
                />
            )}
        </div>
    );
}

function ProductModal({ mode, initialData, branchSlug, tenantSlug, categories, onClose, onSuccess }: { mode: "create" | "edit", initialData?: Partial<MenuResponse['items'][number]>, branchSlug: string, tenantSlug: string, categories: MenuResponse['categories'], onClose: () => void, onSuccess: () => void }) {
    const { canEdit, canView } = useAdminContext();
    const canEditAttributes = canEdit("admin_catalog_attribute_values");
    const canViewAttributes = canView("admin_catalog_attribute_values");
    const theme = useThemeOptional();
    const componentSet = theme?.componentSet ?? "default";
    const Input = getThemedInput({ componentSet, tenantOverrideKey: tenantSlug });
    const Select = getThemedSelect({ componentSet, tenantOverrideKey: tenantSlug });
    const Textarea = getThemedTextarea({ componentSet, tenantOverrideKey: tenantSlug });
    const Button = getThemedButton({ componentSet, tenantOverrideKey: tenantSlug });
    const isBerlin = tenantSlug === "berlin-press";
    const [isPending, startTransition] = useTransition();
    const [form, setForm] = useState<Partial<CreateProductRequest | UpdateProductRequest>>({
        title: initialData?.title || "",
        price: initialData?.price ? initialData.price : 0, // Received as units, keep as units
        categoryId: initialData?.categoryId || categories[0]?.id || "",
        desc: initialData?.desc || "",
        weightG: initialData?.weightG || 0,
        imageUrl: initialData?.imageUrl || ""
    });
    const [attributeDefinitions, setAttributeDefinitions] = useState<AttributeDefinition[]>([]);
    const [attributeValuesByKey, setAttributeValuesByKey] = useState<Record<string, { id: string; value: string | number | boolean | null }>>({});
    const [attributeForm, setAttributeForm] = useState<Record<string, string | boolean>>({});
    const [attributesLoading, setAttributesLoading] = useState(false);
    const [attributesError, setAttributesError] = useState<string | null>(null);
    const [autoFilledFromAttributes, setAutoFilledFromAttributes] = useState(false);
    const definitionByKey = useMemo(() => new Map(attributeDefinitions.map((def) => [def.key, def])), [attributeDefinitions]);

    const emptyAttributeForm = useMemo(() => {
        const initial: Record<string, string | boolean> = {};
        for (const field of BERLIN_FIELDS) {
            initial[field.key] = field.valueType === "BOOL" ? false : "";
        }
        return initial;
    }, []);

    useEffect(() => {
        if (!isBerlin || !tenantSlug) return;
        setAttributesLoading(true);
        setAttributesError(null);
        getAttributeDefinitionsAction(tenantSlug)
            .then((defs) => setAttributeDefinitions(defs))
            .catch((err) => {
                console.error(err);
                setAttributesError(err instanceof Error ? err.message : "Failed to load fields");
            })
            .finally(() => setAttributesLoading(false));
    }, [isBerlin, tenantSlug]);

    useEffect(() => {
        if (!isBerlin || !tenantSlug || !canViewAttributes) {
            if (isBerlin) {
                setAttributeValuesByKey({});
                setAttributeForm(emptyAttributeForm);
                setAutoFilledFromAttributes(false);
            }
            return;
        }
        const itemId = initialData?.id;
        if (!itemId) {
            setAttributeValuesByKey({});
            setAttributeForm(emptyAttributeForm);
            setAutoFilledFromAttributes(false);
            return;
        }
        setAttributesLoading(true);
        setAttributesError(null);
        getAttributeValuesAction(tenantSlug, { itemId })
            .then((values) => {
                const map: Record<string, { id: string; value: string | number | boolean | null }> = {};
                for (const v of values) {
                    const key = v.definition?.key;
                    if (!key) continue;
                    if (v.valueString !== undefined && v.valueString !== null) map[key] = { id: v.id, value: v.valueString };
                    else if (v.valueNumber !== undefined && v.valueNumber !== null) map[key] = { id: v.id, value: v.valueNumber };
                    else if (v.valueBool !== undefined && v.valueBool !== null) map[key] = { id: v.id, value: v.valueBool };
                    else if (v.valueDate !== undefined && v.valueDate !== null) map[key] = { id: v.id, value: v.valueDate };
                }
                setAttributeValuesByKey(map);
                const nextForm: Record<string, string | boolean> = { ...emptyAttributeForm };
                for (const field of BERLIN_FIELDS) {
                    const existing = map[field.key];
                    if (!existing) continue;
                    if (field.valueType === "BOOL") {
                        nextForm[field.key] = Boolean(existing.value);
                    } else if (field.valueType === "NUMBER") {
                        nextForm[field.key] = existing.value !== null && existing.value !== undefined ? String(existing.value) : "";
                    } else if (field.valueType === "DATE") {
                        if (typeof existing.value === "string" && existing.value.length >= 10) {
                            nextForm[field.key] = existing.value.slice(0, 10);
                        }
                    } else {
                        nextForm[field.key] = typeof existing.value === "string" ? existing.value : "";
                    }
                }
                setAttributeForm(nextForm);
                setAutoFilledFromAttributes(false);
            })
            .catch((err) => {
                console.error(err);
                setAttributesError(err instanceof Error ? err.message : "Failed to load field values");
            })
            .finally(() => setAttributesLoading(false));
    }, [isBerlin, tenantSlug, initialData?.id, emptyAttributeForm, canViewAttributes]);

    const missingFieldKeys = useMemo(() => {
        if (!isBerlin) return [];
        return BERLIN_FIELDS.filter((field) => !definitionByKey.has(field.key)).map((field) => field.key);
    }, [definitionByKey, isBerlin]);

    useEffect(() => {
        if (!isBerlin || !canEditAttributes || autoFilledFromAttributes) return;
        if (!attributeDefinitions.length) return;
        if (!initialData?.id) return;
        const title = attributeForm["title_de"] || attributeForm["title_en"];
        const desc = attributeForm["desc_de"] || attributeForm["desc_en"];
        const yearRaw = attributeForm["year"];
        let next = false;
        if (typeof title === "string" && title.trim() && (!form.title || form.title.trim() === "")) {
            setForm((prev) => ({ ...prev, title: title.trim() }));
            next = true;
        }
        if (typeof desc === "string" && desc.trim() && (!form.desc || form.desc.trim() === "")) {
            setForm((prev) => ({ ...prev, desc: desc.trim() }));
            next = true;
        }
        if (typeof yearRaw === "string" && yearRaw.trim()) {
            const parsed = Number(yearRaw);
            if (Number.isFinite(parsed) && (!form.weightG || form.weightG === 0)) {
                setForm((prev) => ({ ...prev, weightG: Math.round(parsed) }));
                next = true;
            }
        }
        if (next) setAutoFilledFromAttributes(true);
    }, [isBerlin, canEditAttributes, attributeDefinitions.length, initialData?.id, attributeForm, form.title, form.desc, form.weightG, autoFilledFromAttributes]);

    const persistAttributes = async (itemId: string) => {
        if (!isBerlin || !canEditAttributes) return;
        if (!attributeDefinitions.length) return;
        const ops: Array<Promise<unknown>> = [];
        for (const field of BERLIN_FIELDS) {
            const def = definitionByKey.get(field.key);
            if (!def) continue;
            const raw = attributeForm[field.key];
            const existing = attributeValuesByKey[field.key];
            const valueType = def.valueType;

            const addUpdate = (payload: { valueString?: string | null; valueNumber?: number | null; valueBool?: boolean | null; valueDate?: string | null }) => {
                const normalized = {
                    valueString: payload.valueString ?? undefined,
                    valueNumber: payload.valueNumber ?? undefined,
                    valueBool: payload.valueBool ?? undefined,
                    valueDate: payload.valueDate ?? undefined,
                };
                if (existing?.id) {
                    ops.push(updateAttributeValueAction(tenantSlug, existing.id, normalized));
                } else {
                    ops.push(createAttributeValueAction(tenantSlug, { itemId, definitionId: def.id, ...normalized }));
                }
            };

            if (valueType === "BOOL") {
                const boolVal = Boolean(raw);
                if (!existing && !boolVal) continue;
                addUpdate({ valueBool: boolVal });
                continue;
            }

            if (valueType === "NUMBER") {
                const rawText = typeof raw === "string" ? raw.trim() : "";
                if (rawText === "") {
                    if (existing?.id) ops.push(deleteAttributeValueAction(tenantSlug, existing.id));
                    continue;
                }
                const num = Number(rawText);
                if (Number.isNaN(num)) continue;
                addUpdate({ valueNumber: num });
                continue;
            }

            if (valueType === "DATE") {
                const rawText = typeof raw === "string" ? raw.trim() : "";
                if (rawText === "") {
                    if (existing?.id) ops.push(deleteAttributeValueAction(tenantSlug, existing.id));
                    continue;
                }
                const iso = new Date(rawText).toISOString();
                addUpdate({ valueDate: iso });
                continue;
            }

            const textVal = typeof raw === "string" ? raw.trim() : "";
            if (textVal === "") {
                if (existing?.id) ops.push(deleteAttributeValueAction(tenantSlug, existing.id));
                continue;
            }
            addUpdate({ valueString: textVal });
        }
        if (ops.length) {
            await Promise.all(ops);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        startTransition(async () => {
            let res;
            const getLocalizedFallback = (key: string) => {
                const raw = attributeForm[key];
                return typeof raw === "string" && raw.trim() ? raw.trim() : "";
            };
            const fallbackTitle = isBerlin
                ? (form.title || getLocalizedFallback("title_de") || getLocalizedFallback("title_en"))
                : (form.title || "");
            const fallbackDesc = isBerlin
                ? (form.desc || getLocalizedFallback("desc_de") || getLocalizedFallback("desc_en"))
                : (form.desc || "");
            const yearFallbackRaw = isBerlin ? getLocalizedFallback("year") : "";
            const yearFallback = yearFallbackRaw ? Number(yearFallbackRaw) : null;
            const weightGValue = (form.weightG && form.weightG > 0)
                ? form.weightG
                : (Number.isFinite(yearFallback) ? Math.round(yearFallback as number) : 0);

            if (isBerlin && !fallbackTitle) {
                alert("Please provide at least one localized title (DE/EN/RU) or a fallback title.");
                return;
            }

            const payload: {
                title: string;
                price: number;
                categoryId: string;
                desc: string;
                weightG: number;
                imageUrl?: string | null;
            } = {
                title: fallbackTitle || "",
                price: form.price || 0,
                categoryId: form.categoryId || "",
                desc: fallbackDesc || "",
                weightG: weightGValue,
                imageUrl: null
            };

            // STRICT PATCH SEMANTICS:
            // Only send imageUrl if it was actually changed by the user.
            // This prevents triggering strict validation on legacy data that hasn't been touched.
            const norm = (v: unknown) => (typeof v === 'string' ? v.trim() : (v || null));

            if (mode === "create") {
                payload.imageUrl = form.imageUrl || null;
            } else {
                const isImageChanged = norm(form.imageUrl) !== norm(initialData?.imageUrl);
                if (isImageChanged) {
                    payload.imageUrl = form.imageUrl || null;
                } else {
                    payload.imageUrl = undefined; // Don't send (undefined) if unchanged
                }
            }

            if (mode === "create") {
                res = await createProductAction(branchSlug, payload, tenantSlug);
            } else {
                if (initialData?.id) {
                    res = await updateProductAction(branchSlug, initialData.id, payload, tenantSlug);
                }
            }

            if (res) {
                const itemId = mode === "create" ? (res as { id?: string } | null)?.id : initialData?.id;
                if (isBerlin && itemId) {
                    try {
                        await persistAttributes(itemId);
                    } catch (err) {
                        console.error(err);
                        alert("Saved the book, but failed to update metadata fields.");
                    } finally {
                        await revalidateMenuCacheAction(tenantSlug, branchSlug);
                    }
                } else if (isBerlin && !itemId) {
                    alert("Saved the book, but no item id was returned to update metadata fields.");
                }
                onSuccess();
            } else {
                alert("Operation failed. Refresh the page if your permissions were changed.");
            }
        });
    };

    return (
        <Modal
            open={true}
            onClose={onClose}
            portal={true}
            lockScroll={true}
            closeOnEsc={true}
            closeOnBackdrop={false}
            overlayClassName="p-4"
            panelClassName={isBerlin ? "p-5 w-[720px] max-w-[95%]" : "p-5 w-[400px] max-w-[90%]"}
            titleId="product-modal-title"
        >
            <h3 id="product-modal-title">
                {mode === "create" ? (isBerlin ? "Add New Book" : "Add New Dish") : (isBerlin ? "Edit Book" : "Edit Dish")}
            </h3>
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <label>
                        {isBerlin ? "Fallback title" : "Title"} {!isBerlin && <span className="text-danger">*</span>}
                        <Input className="input" required={!isBerlin} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
                    </label>
                    <label>
                        {isBerlin ? "Collection" : "Category"} <span className="text-danger">*</span>
                        <Select className="input" required value={form.categoryId} onChange={e => setForm({ ...form, categoryId: e.target.value })} options={categories.map(c => ({ value: c.id, label: c.title }))} />
                    </label>
                    <label>
                        {isBerlin ? "Price (€)" : "Price (Units)"} <span className="text-danger">*</span>
                        <Input className="input" type="number" step="0.01" required value={form.price || ""} onChange={e => setForm({ ...form, price: parseFloat(e.target.value) })} />
                    </label>
                    <label>
                        {isBerlin ? "Legacy year (optional)" : "Weight (g)"}
                        <Input className="input" type="number" value={form.weightG || ""} onChange={e => setForm({ ...form, weightG: parseInt(e.target.value) })} />
                    </label>
                    <label>
                        {isBerlin ? "Fallback description" : "Description"}
                        <Textarea className="input" value={form.desc || ""} onChange={e => setForm({ ...form, desc: e.target.value })} />
                    </label>
                    <label>
                        {isBerlin ? "Cover image" : "Image"}
                        <div style={{ border: "1px solid var(--line)", padding: 10, borderRadius: 5, marginTop: 5 }}>
                            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                                {form.imageUrl ? (
                                    <img src={form.imageUrl} alt="Preview" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line)" }} />
                                ) : (
                                    <div style={{ width: 60, height: 60, background: "var(--line)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "var(--muted)" }}>No Image</div>
                                )}
                                <div>
                                    <Input
                                        type="file"
                                        accept="image/png, image/jpeg, image/webp"
                                        onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;
                                            if (file.size > 10 * 1024 * 1024) {
                                                alert("File is too large (Max 10MB)");
                                                return;
                                            }

                                            // Server Action Upload
                                            try {
                                                e.target.disabled = true;
                                                const formData = new FormData();
                                                formData.append("file", file);

                                                const { url, urlPath } = await uploadFileAction(formData, tenantSlug);
                                                setForm(prev => ({ ...prev, imageUrl: urlPath || url }));
                                            } catch (error) {
                                                alert("Upload failed");
                                                console.error(error);
                                            } finally {
                                                e.target.disabled = false;
                                                e.target.value = ""; // Reset input
                                            }
                                        }}
                                    />
                                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Max 10MB. JPG, PNG, WebP.</div>
                                </div>
                            </div>
                            <Input
                                className="input"
                                placeholder="Or paste external URL..."
                                value={form.imageUrl || ""}
                                onChange={e => setForm({ ...form, imageUrl: e.target.value })}
                                style={{ width: "100%", fontSize: 12 }}
                            />
                        </div>
                    </label>

                    {isBerlin && (
                        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 12 }}>
                            <h4 style={{ marginBottom: 10 }}>Book Metadata</h4>
                            {attributesLoading && (
                                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
                                    Loading fields...
                                </div>
                            )}
                            {attributesError && (
                                <div className="bg-danger-weak text-danger" style={{ padding: 10, borderRadius: 6, marginBottom: 10 }}>
                                    {attributesError}
                                </div>
                            )}
                            {!canEditAttributes && (
                                <div className="bg-warning-weak text-warning" style={{ padding: 10, borderRadius: 6, marginBottom: 10, fontSize: 12 }}>
                                    You do not have permission to edit metadata fields.
                                </div>
                            )}
                            {!attributesLoading && missingFieldKeys.length > 0 && (
                                <div className="bg-warning-weak text-warning" style={{ padding: 10, borderRadius: 6, marginBottom: 10, fontSize: 12 }}>
                                    Missing field definitions: {missingFieldKeys.join(", ")}. Use “Manage Fields” to create them.
                                </div>
                            )}

                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Localized Content</div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                        {BERLIN_FIELDS.filter((f) => f.group === "localized").map((field) => {
                                            const disabled = attributesLoading || !definitionByKey.has(field.key) || !canEditAttributes;
                                            const value = attributeForm[field.key];
                                            if (field.input === "textarea") {
                                                return (
                                                    <label key={field.key}>
                                                        {field.label}
                                                        <Textarea
                                                            className="input"
                                                            value={typeof value === "string" ? value : ""}
                                                            disabled={disabled}
                                                            onChange={(e) => setAttributeForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                                                        />
                                                    </label>
                                                );
                                            }
                                            return (
                                                <label key={field.key}>
                                                    {field.label}
                                                    <Input
                                                        className="input"
                                                        value={typeof value === "string" ? value : ""}
                                                        disabled={disabled}
                                                        onChange={(e) => setAttributeForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                                                    />
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Metadata</div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                        {BERLIN_FIELDS.filter((f) => f.group === "metadata").map((field) => {
                                            const disabled = attributesLoading || !definitionByKey.has(field.key) || !canEditAttributes;
                                            const value = attributeForm[field.key];
                                            if (field.input === "select") {
                                                return (
                                                    <label key={field.key}>
                                                        {field.label}
                                                        <Select
                                                            className="input"
                                                            value={typeof value === "string" ? value : ""}
                                                            disabled={disabled}
                                                            onChange={(e) => setAttributeForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                                                            options={field.options ?? []}
                                                        />
                                                    </label>
                                                );
                                            }
                                            return (
                                                <label key={field.key}>
                                                    {field.label}
                                                    <Input
                                                        className="input"
                                                        type={field.input === "number" ? "number" : field.input === "date" ? "date" : "text"}
                                                        value={typeof value === "string" ? value : ""}
                                                        disabled={disabled}
                                                        placeholder={field.placeholder}
                                                        onChange={(e) => setAttributeForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                                                    />
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Availability</div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                        {BERLIN_FIELDS.filter((f) => f.group === "availability").map((field) => {
                                            const disabled = attributesLoading || !definitionByKey.has(field.key) || !canEditAttributes;
                                            const value = attributeForm[field.key];
                                            if (field.input === "checkbox") {
                                                return (
                                                    <label key={field.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={Boolean(value)}
                                                            disabled={disabled}
                                                            onChange={(e) => setAttributeForm((prev) => ({ ...prev, [field.key]: e.target.checked }))}
                                                        />
                                                        <span>{field.label}</span>
                                                    </label>
                                                );
                                            }
                                            return (
                                                <label key={field.key}>
                                                    {field.label}
                                                    <Input
                                                        className="input"
                                                        type="number"
                                                        value={typeof value === "string" ? value : ""}
                                                        disabled={disabled}
                                                        onChange={(e) => setAttributeForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                                                    />
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                        <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
                        <Button type="submit" variant="primary" disabled={isPending}>{isPending ? "Saving..." : "Save"}</Button>
                    </div>
                </form>
        </Modal>
    );
}

type CategoryWithSort = MenuResponse['categories'][number] & { sortOrder?: number };

function CategoryManager({ branchSlug, tenantSlug, categories, onClose, onSuccess }: { branchSlug: string, tenantSlug: string, categories: MenuResponse['categories'], onClose: () => void, onSuccess: () => void }) {
    const theme = useThemeOptional();
    const componentSet = theme?.componentSet ?? "default";
    const Input = getThemedInput({ componentSet, tenantOverrideKey: tenantSlug });
    const Button = getThemedButton({ componentSet, tenantOverrideKey: tenantSlug });
    const isBerlin = tenantSlug === "berlin-press";
    const [isPending, startTransition] = useTransition();
    const [mode, setMode] = useState<"list" | "create" | "edit">("list");
    const [editingId, setEditingId] = useState("");
    const [form, setForm] = useState({ title: "", sortOrder: 0 });

    const writeErrorHint = " Refresh the page if your permissions were changed.";
    const handleCreate = () => {
        startTransition(async () => {
            const res = await createCategoryAction(branchSlug, form, tenantSlug);
            if (res) { onSuccess(); setMode("list"); setForm({ title: "", sortOrder: 0 }); }
            else alert("Failed." + writeErrorHint);
        });
    };

    const handleToggle = (id: string, current: boolean) => {
        startTransition(async () => {
            const res = await toggleCategoryAction(branchSlug, id, !current, tenantSlug);
            if (res) onSuccess();
        });
    };

    const handleUpdate = () => {
        startTransition(async () => {
            const res = await updateCategoryAction(branchSlug, editingId, form, tenantSlug);
            if (res) { onSuccess(); setMode("list"); setEditingId(""); setForm({ title: "", sortOrder: 0 }); }
            else alert("Failed." + writeErrorHint);
        });
    };

    const handleDelete = (id: string) => {
        if (!confirm(isBerlin ? "Delete collection? Books in this collection will be moved to 'Uncategorized'." : "Delete category? Products in this category will be moved to 'Uncategorized'.")) return;
        startTransition(async () => {
            const res = await deleteCategoryAction(branchSlug, id, tenantSlug);
            if (res) onSuccess();
            else alert("Failed." + writeErrorHint);
        });
    };

    const handleReorder = (index: number, direction: -1 | 1) => {
        const newCategories = [...categories];
        const targetIndex = index + direction;

        if (targetIndex < 0 || targetIndex >= newCategories.length) return;

        // Swap in local state immediately for responsiveness (optimistic-ish)
        // But we rely on onSuccess() to re-load true state.

        const itemA = newCategories[index];
        const itemB = newCategories[targetIndex];

        if (!itemA || !itemB) return;

        newCategories[index] = itemB;
        newCategories[targetIndex] = itemA;

        // Re-calcd sort order is just implicit by array index
        const ids = newCategories.map(c => c.id);

        startTransition(async () => {
            const res = await reorderCategoriesAction(branchSlug, ids, tenantSlug);
            if (res) onSuccess();
        });
    };

    return (
        <Modal
            open={true}
            onClose={onClose}
            portal={true}
            lockScroll={true}
            closeOnEsc={true}
            closeOnBackdrop={false}
            overlayClassName="p-4"
            panelClassName="p-5 w-[500px] max-w-[90%]"
            titleId="category-manager-modal-title"
        >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 15 }}>
                <h3 id="category-manager-modal-title">{isBerlin ? "Manage Collections" : "Manage Categories"}</h3>
                {mode === "list" && <Button variant="primary" onClick={() => { setMode("create"); setForm({ title: "", sortOrder: 0 }); }}>+ New</Button>}
                {mode !== "list" && <Button variant="outline" onClick={() => setMode("list")}>Back</Button>}
            </div>

                {mode === "list" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {(categories as CategoryWithSort[]).map(c => (
                            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid var(--line)", padding: 8, borderRadius: 4, background: c.isAvailable ? "var(--paper)" : "var(--bg)", opacity: c.isAvailable ? 1 : 0.6 }}>
                                <span>
                                    {c.title} <small className="muted">({c.sortOrder})</small>
                                    {!c.isAvailable && <span style={{ marginLeft: 8, fontSize: 10, background: "var(--line)", color: "var(--ink)", padding: "2px 4px", borderRadius: 4 }}>HIDDEN</span>}
                                </span>
                                <div>
                                    <Button variant="outline" style={{ padding: "2px 6px", fontSize: 12, marginRight: 5 }} onClick={() => handleReorder(categories.indexOf(c), -1)} disabled={isPending || categories.indexOf(c) === 0}>↑</Button>
                                    <Button variant="outline" style={{ padding: "2px 6px", fontSize: 12, marginRight: 15 }} onClick={() => handleReorder(categories.indexOf(c), 1)} disabled={isPending || categories.indexOf(c) === categories.length - 1}>↓</Button>

                                    <Button className={`${c.isAvailable ? 'bg-warning' : 'bg-success'}`} style={{ padding: "2px 6px", fontSize: 12, marginRight: 5 }} onClick={() => handleToggle(c.id, !!c.isAvailable)} disabled={isPending}>
                                        {c.isAvailable ? "Hide" : "Show"}
                                    </Button>
                                    <Button variant="outline" style={{ padding: "2px 6px", fontSize: 12, marginRight: 5 }} onClick={() => { setEditingId(c.id); setForm({ title: c.title, sortOrder: (c as CategoryWithSort).sortOrder || 0 }); setMode("edit"); }}>Edit</Button>
                                    <Button className="bg-danger" style={{ padding: "2px 6px", fontSize: 12 }} onClick={() => handleDelete(c.id)} disabled={isPending}>X</Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {(mode === "create" || mode === "edit") && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <label>
                            Title <Input className="input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
                        </label>
                        <label>
                            Sort Order <Input className="input" type="number" value={form.sortOrder} onChange={e => setForm({ ...form, sortOrder: parseInt(e.target.value) })} />
                        </label>
                        <Button variant="primary" onClick={mode === "create" ? handleCreate : handleUpdate} disabled={isPending}>
                            {isPending ? "Saving..." : (mode === "create" ? "Create" : "Update")}
                        </Button>
                    </div>
                )}

                <div style={{ marginTop: 20, textAlign: "right" }}>
                    <Button variant="outline" onClick={onClose}>Close</Button>
                </div>
        </Modal>
    );
}

function AttributeDefinitionManager({ tenantSlug, onClose }: { tenantSlug: string; onClose: () => void }) {
    const theme = useThemeOptional();
    const componentSet = theme?.componentSet ?? "default";
    const Input = getThemedInput({ componentSet, tenantOverrideKey: tenantSlug });
    const Select = getThemedSelect({ componentSet, tenantOverrideKey: tenantSlug });
    const Button = getThemedButton({ componentSet, tenantOverrideKey: tenantSlug });
    const [definitions, setDefinitions] = useState<AttributeDefinition[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [mode, setMode] = useState<"list" | "create" | "edit">("list");
    const [editingId, setEditingId] = useState("");
    const [isPending, startTransition] = useTransition();
    const [form, setForm] = useState<{ key: string; label: string; valueType: AttributeValueType; isFilterable: boolean; isSearchable: boolean }>({
        key: "",
        label: "",
        valueType: "STRING",
        isFilterable: false,
        isSearchable: false,
    });

    const valueTypeOptions = [
        { value: "STRING", label: "Text" },
        { value: "NUMBER", label: "Number" },
        { value: "BOOL", label: "Yes / No" },
        { value: "DATE", label: "Date" },
        { value: "ENUM", label: "Enum" },
    ] satisfies { value: AttributeValueType; label: string }[];

    const filterableKeys = useMemo(() => new Set([
        "format",
        "genre",
        "badges",
        "year",
        "pages",
        "age_rating",
        "type",
        "preorder",
        "release_date",
        "old_price",
    ]), []);
    const searchableKeys = useMemo(() => new Set([
        "isbn",
        "publisher",
        "title_de",
        "title_en",
        "author_de",
        "author_en",
        "desc_de",
        "desc_en",
    ]), []);

    const recommendedDefinitions = useMemo(() => (
        BERLIN_FIELDS.map((field) => ({
            key: field.key,
            label: field.label,
            valueType: field.valueType,
            isFilterable: filterableKeys.has(field.key),
            isSearchable: searchableKeys.has(field.key),
        }))
    ), [filterableKeys, searchableKeys]);

    const missingRecommended = useMemo(() => {
        const existing = new Set(definitions.map((d) => d.key));
        return recommendedDefinitions.filter((def) => !existing.has(def.key));
    }, [definitions, recommendedDefinitions]);

    const load = useCallback(async () => {
        if (!tenantSlug) return;
        setLoading(true);
        setError(null);
        try {
            const list = await getAttributeDefinitionsAction(tenantSlug);
            setDefinitions(list);
        } catch (e) {
            console.error(e);
            setError(e instanceof Error ? e.message : "Failed to load fields");
        } finally {
            setLoading(false);
        }
    }, [tenantSlug]);

    useEffect(() => {
        void load();
    }, [load]);

    const openCreate = () => {
        setMode("create");
        setEditingId("");
        setForm({ key: "", label: "", valueType: "STRING", isFilterable: false, isSearchable: false });
    };

    const openEdit = (def: AttributeDefinition) => {
        setMode("edit");
        setEditingId(def.id);
        setForm({
            key: def.key,
            label: def.label,
            valueType: def.valueType,
            isFilterable: def.isFilterable,
            isSearchable: def.isSearchable,
        });
    };

    const handleCreate = () => {
        if (!form.key.trim() || !form.label.trim()) return;
        startTransition(async () => {
            await createAttributeDefinitionAction(tenantSlug, {
                key: form.key.trim(),
                label: form.label.trim(),
                valueType: form.valueType,
                isFilterable: form.isFilterable,
                isSearchable: form.isSearchable,
                appliesToBaseTypes: ["GOOD"],
            });
            await load();
            setMode("list");
        });
    };

    const handleUpdate = () => {
        if (!editingId) return;
        startTransition(async () => {
            await updateAttributeDefinitionAction(tenantSlug, editingId, {
                label: form.label.trim(),
                isFilterable: form.isFilterable,
                isSearchable: form.isSearchable,
            });
            await load();
            setMode("list");
            setEditingId("");
        });
    };

    const handleDelete = (id: string) => {
        if (!confirm("Delete this field definition?")) return;
        startTransition(async () => {
            await deleteAttributeDefinitionAction(tenantSlug, id);
            await load();
        });
    };

    const handleCreateDefaults = () => {
        if (missingRecommended.length === 0) return;
        startTransition(async () => {
            for (const def of missingRecommended) {
                await createAttributeDefinitionAction(tenantSlug, {
                    key: def.key,
                    label: def.label,
                    valueType: def.valueType,
                    isFilterable: def.isFilterable,
                    isSearchable: def.isSearchable,
                    appliesToBaseTypes: ["GOOD"],
                });
            }
            await load();
        });
    };

    return (
        <Modal
            open={true}
            onClose={onClose}
            portal={true}
            lockScroll={true}
            closeOnEsc={true}
            closeOnBackdrop={false}
            overlayClassName="p-4"
            panelClassName="p-5 w-[520px] max-w-[95%]"
            titleId="fields-modal-title"
        >
            <h3 id="fields-modal-title">Field Builder</h3>

            {mode === "list" && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "12px 0 16px" }}>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        Create custom metadata fields for the catalog.
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <Button type="button" variant="outline" onClick={handleCreateDefaults} disabled={isPending || missingRecommended.length === 0}>
                            Create Defaults
                        </Button>
                        <Button type="button" variant="primary" onClick={openCreate}>
                            New Field
                        </Button>
                    </div>
                </div>
            )}

            {loading && <div style={{ padding: 12, color: "var(--muted)" }}>Loading fields...</div>}
            {error && !loading && (
                <div className="bg-danger-weak text-danger" style={{ padding: 12, borderRadius: 8, marginBottom: 12 }}>
                    {error}
                </div>
            )}

            {mode === "list" && !loading && !error && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {definitions.length === 0 && (
                        <div style={{ padding: 12, color: "var(--muted)", border: "1px dashed var(--line)", borderRadius: 8 }}>
                            No custom fields yet.
                        </div>
                    )}
                    {definitions.map((def) => (
                        <div key={def.id} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 12, display: "flex", justifyContent: "space-between", gap: 12 }}>
                            <div>
                                <div style={{ fontWeight: 700 }}>{def.label}</div>
                                <div style={{ fontSize: 12, color: "var(--muted)" }}>{def.key} • {def.valueType}</div>
                                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                                    {def.isFilterable ? "Filterable" : "Not filterable"} · {def.isSearchable ? "Searchable" : "Not searchable"}
                                </div>
                            </div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <Button type="button" variant="outline" onClick={() => openEdit(def)}>Edit</Button>
                                <Button type="button" className="text-danger" variant="ghost" onClick={() => handleDelete(def.id)} disabled={isPending}>
                                    Delete
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {(mode === "create" || mode === "edit") && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
                    <label>
                        Key <span className="text-danger">*</span>
                        <Input
                            className="input"
                            value={form.key}
                            onChange={(e) => setForm({ ...form, key: e.target.value })}
                            disabled={mode === "edit"}
                        />
                    </label>
                    <label>
                        Label <span className="text-danger">*</span>
                        <Input
                            className="input"
                            value={form.label}
                            onChange={(e) => setForm({ ...form, label: e.target.value })}
                        />
                    </label>
                    <label>
                        Value type
                        <Select
                            className="input"
                            value={form.valueType}
                            onChange={(e) => setForm({ ...form, valueType: e.target.value as AttributeValueType })}
                            options={valueTypeOptions}
                            disabled={mode === "edit"}
                        />
                    </label>
                    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <input
                                type="checkbox"
                                checked={form.isFilterable}
                                onChange={(e) => setForm({ ...form, isFilterable: e.target.checked })}
                            />
                            <span>Filterable</span>
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <input
                                type="checkbox"
                                checked={form.isSearchable}
                                onChange={(e) => setForm({ ...form, isSearchable: e.target.checked })}
                            />
                            <span>Searchable</span>
                        </label>
                    </div>
                    <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                        <Button type="button" variant="outline" onClick={() => setMode("list")} disabled={isPending}>
                            Cancel
                        </Button>
                        <Button type="button" variant="primary" onClick={mode === "create" ? handleCreate : handleUpdate} disabled={isPending}>
                            {isPending ? "Saving..." : "Save"}
                        </Button>
                    </div>
                </div>
            )}
        </Modal>
    );
}
