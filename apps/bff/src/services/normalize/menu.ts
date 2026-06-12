import { zMenuResponse } from "@vendora/contracts";
import { absUrl, slugify, stableId, toNumber, unwrap, SafeRecord } from "./util.js";
import { logger } from "../../lib/logger.js";

export type NormalizeOpts = {
  baseUrl?: string;
  unwrapKeys: string[];
  context?: {
    requestId?: string;
    tenantId?: string; // Future proofing
    branchSlug?: string;
  };
};

type RawCategory = SafeRecord;
type RawItem = SafeRecord;

function pickStr(obj: unknown, keys: string[]): string | undefined {
  const rec = obj as SafeRecord;
  for (const k of keys) {
    const v = rec?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function pickAny(obj: unknown, keys: string[]): unknown {
  const rec = obj as SafeRecord;
  for (const k of keys) {
    const v = rec?.[k];
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

export function normalizeMenu(rawInput: unknown, opts: NormalizeOpts) {
  try {
    const raw0 = unwrap(rawInput, opts.unwrapKeys);
    const rec0 = raw0 as SafeRecord;

    // Access nested 'menu' safely
    const nestedMenu = rec0?.menu as SafeRecord | undefined;
    // logic: const raw = raw0?.menu ? unwrap(raw0.menu, opts.unwrapKeys) : raw0;
    const raw = nestedMenu ? unwrap(nestedMenu, opts.unwrapKeys) : raw0;
    const recRaw = raw as SafeRecord;

    // Case A: already matches our contract
    const ok = zMenuResponse.safeParse(raw);
    if (ok.success) return ok.data;

    // Case B: wrapper objects with categories/items
    // raw?.categories ?? raw?.menu?.categories ?? raw?.result?.categories ?? raw?.data?.categories ?? raw?.groups;
    // This deep access requires casting
    const rawMenu = recRaw?.menu as SafeRecord | undefined;
    const rawResult = recRaw?.result as SafeRecord | undefined;
    const rawData = recRaw?.data as SafeRecord | undefined;

    const categoriesRaw =
      recRaw?.categories ??
      rawMenu?.categories ??
      rawResult?.categories ??
      rawData?.categories ??
      recRaw?.groups;

    // raw?.items ?? raw?.products ?? raw?.menu?.items ?? raw?.result?.items ?? raw?.data?.items ?? raw?.goods;
    const itemsRaw =
      recRaw?.items ??
      recRaw?.products ??
      rawMenu?.items ??
      rawResult?.items ??
      rawData?.items ??
      recRaw?.goods;

    // Case C: nested items inside categories
    if (Array.isArray(categoriesRaw) && !Array.isArray(itemsRaw)) {
      const cats = categoriesRaw as RawCategory[];
      const categories = cats.map((c) => {
        const title = pickStr(c, ["title", "name", "label"]) ?? "Category";
        const id = pickStr(c, ["id", "categoryId", "uid"]) ?? slugify(title);
        const slug = pickStr(c, ["slug", "code"]) ?? slugify(pickStr(c, ["id"]) ?? title);
        return { id, slug, title };
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items: any[] = [];
      for (const c of cats) {
        const catTitle = pickStr(c, ["title", "name", "label"]) ?? "Category";
        const catSlug = pickStr(c, ["slug", "code"]) ?? slugify(pickStr(c, ["id"]) ?? catTitle);

        const nested = (c?.items ?? c?.products ?? c?.goods ?? c?.children) as RawItem[] | undefined;
        if (!Array.isArray(nested)) continue;

        for (const it of nested) {
          const title = pickStr(it, ["title", "name", "label"]) ?? "Item";
          const id = pickStr(it, ["id", "sku", "productId", "uid"]) ?? stableId([catSlug, title, String(pickAny(it, ["price", "cost"]))]);
          const price = toNumber(pickAny(it, ["price", "cost", "amount", "priceUah"])) ?? 0;

          items.push({
            id,
            title,
            price,
            imageUrl: absUrl(opts.baseUrl, pickStr(it, ["imageUrl", "image", "img", "photo", "picture"])),
            categorySlug: catSlug,
          });
        }
      }

      const parsed = zMenuResponse.safeParse({ categories, items });
      if (!parsed.success) throw new Error("normalizeMenu: cannot adapt nested categories/items");
      return parsed.data;
    }

    // Case B continued: separate arrays
    if (Array.isArray(categoriesRaw) && Array.isArray(itemsRaw)) {
      const categories = (categoriesRaw as RawCategory[]).map((c) => {
        const title = pickStr(c, ["title", "name", "label"]) ?? "Category";
        const id = pickStr(c, ["id", "categoryId", "uid"]) ?? slugify(title);
        const slug = pickStr(c, ["slug", "code"]) ?? slugify(pickStr(c, ["id"]) ?? title);
        return { id, slug, title };
      });

      // Build category id -> slug map if upstream uses ids
      const catIdToSlug = new Map<string, string>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (let i = 0; i < (categoriesRaw as any[]).length; i++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c = (categoriesRaw as any[])[i] as SafeRecord;
        const id = pickStr(c, ["id", "categoryId", "uid"]);
        const slug = categories[i]?.slug;
        if (id && slug) catIdToSlug.set(id, slug);
      }

      const items = (itemsRaw as RawItem[]).map((it) => {
        const title = pickStr(it, ["title", "name", "label"]) ?? "Item";
        const id = pickStr(it, ["id", "sku", "productId", "uid"]) ?? stableId([title, String(pickAny(it, ["price", "cost"]))]);
        const price = toNumber(pickAny(it, ["price", "cost", "amount", "priceUah"])) ?? 0;

        const catObj = it?.category as SafeRecord | undefined;

        const categorySlug =
          pickStr(it, ["categorySlug"]) ??
          pickStr(catObj, ["slug"]) ??
          (pickStr(it, ["categoryId", "groupId"]) ? catIdToSlug.get(pickStr(it, ["categoryId", "groupId"])!) : undefined) ??
          (categories[0]?.slug ?? "menu");

        return {
          id,
          title,
          price,
          imageUrl: absUrl(opts.baseUrl, pickStr(it, ["imageUrl", "image", "img", "photo", "picture"])),
          categorySlug,
        };
      });

      const parsed = zMenuResponse.safeParse({ categories, items });
      if (!parsed.success) throw new Error("normalizeMenu: cannot adapt categories/items");
      return parsed.data;
    }

    // Case D: raw is an array of items (no categories)
    if (Array.isArray(raw)) {
      const categorySlug = "menu";
      const categories = [{ id: categorySlug, slug: categorySlug, title: "Menu" }];
      const items = (raw as RawItem[]).map((it) => {
        const title = pickStr(it, ["title", "name", "label"]) ?? "Item";
        const id = pickStr(it, ["id", "sku", "productId", "uid"]) ?? stableId([title, String(pickAny(it, ["price", "cost"]))]);
        const price = toNumber(pickAny(it, ["price", "cost", "amount", "priceUah"])) ?? 0;
        return {
          id,
          title,
          price,
          imageUrl: absUrl(opts.baseUrl, pickStr(it, ["imageUrl", "image", "img", "photo", "picture"])),
          categorySlug,
        };
      });
      const parsed = zMenuResponse.safeParse({ categories, items });
      if (!parsed.success) throw new Error("normalizeMenu: cannot adapt array menu");
      return parsed.data;
    }

    throw new Error("normalizeMenu: unsupported upstream menu shape");

  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    logger.warn({
      type: "UPSTREAM_MENU_SHAPE_INVALID",
      ...opts.context,
      error: e.message,
      keys: typeof rawInput === 'object' ? Object.keys(rawInput as object) : []
    }, "Failed to normalize menu. Returning empty fallback.");

    return { categories: [], items: [] };
  }
}
