import { mapCategory } from "../../../utils/mappers.js";
import type { FastifyInstance } from "fastify";
import { getOrSet } from "../../../cache/stale.js";
import { zMenuCategorySummaryPayload, zMenuItemsPayload, zMenuResponse } from "@vendora/contracts";
import { CacheKeys } from "../../../services/cache-keys.js";
import type { RoutesDependencies } from "../../../types/dependencies.js";
import { moneyFromMinor } from "../../../utils/money.js";
import { validateTenant } from "../../../plugins/tenant-guard.js";
import { requireStorefrontFeature } from "../../../lib/feature-guard.js";

const BERLIN_TENANT_SLUG = "berlin-press";
const BERLIN_ATTRIBUTE_KEYS = [
  "title_de",
  "title_en",
  "desc_de",
  "desc_en",
  "badges",
  "format",
  "year",
  "pages",
  "author_en",
  "author_de",
  "preorder",
  "old_price",
] as const;

type BerlinAttributeKey = (typeof BERLIN_ATTRIBUTE_KEYS)[number];
type BerlinAttributeValue = string | number | boolean;
type BerlinAttributeMap = Map<string, Partial<Record<BerlinAttributeKey, BerlinAttributeValue>>>;

const BERLIN_LOCALES = ["de", "en"] as const;
type BerlinLocale = (typeof BERLIN_LOCALES)[number];

function resolveBerlinLocale(value: unknown): BerlinLocale | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if ((BERLIN_LOCALES as readonly string[]).includes(normalized)) {
    return normalized as BerlinLocale;
  }
  return null;
}

function normalizeBerlinTag(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function parseBerlinList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,;\n]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function pickBerlinLocalized(
  values: Partial<Record<BerlinAttributeKey, BerlinAttributeValue>>,
  locale: BerlinLocale | null,
  baseKey: "title" | "desc" | "author",
  fallback: string
): string {
  const orderedLocales = locale
    ? [locale, ...BERLIN_LOCALES.filter((l) => l !== locale)]
    : [...BERLIN_LOCALES];

  for (const loc of orderedLocales) {
    const key = `${baseKey}_${loc}` as BerlinAttributeKey;
    const raw = values[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return fallback;
}

function getBerlinAuthor(values: Partial<Record<BerlinAttributeKey, BerlinAttributeValue>>, locale: BerlinLocale | null): string | null {
  const author = pickBerlinLocalized(values, locale, "author", "");
  return author.trim() ? author : null;
}

function buildBerlinTags(values: Partial<Record<BerlinAttributeKey, BerlinAttributeValue>>, locale: BerlinLocale | null): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();
  const push = (tag: string) => {
    if (!tag) return;
    if (seen.has(tag)) return;
    seen.add(tag);
    tags.push(tag);
  };

  const badges = parseBerlinList(typeof values.badges === "string" ? values.badges : undefined)
    .map((tag) => normalizeBerlinTag(tag))
    .filter(Boolean);
  badges.forEach(push);

  const preorder = values.preorder === true;
  if (preorder) push("preorder");

  if (typeof values.format === "string" && values.format.trim()) {
    const format = normalizeBerlinTag(values.format);
    push(format);
  }

  if (typeof values.year === "number" && Number.isFinite(values.year)) {
    push(String(Math.round(values.year)));
  } else if (typeof values.year === "string") {
    const match = values.year.trim().match(/(19|20)\d{2}/);
    if (match) push(match[0]);
  }

  if (typeof values.pages === "number" && Number.isFinite(values.pages)) {
    push(`pages:${Math.round(values.pages)}`);
  } else if (typeof values.pages === "string") {
    const match = values.pages.trim().match(/\d{2,4}/);
    if (match) push(`pages:${match[0]}`);
  }

  const author = getBerlinAuthor(values, locale);
  if (author) push(`by ${author}`);

  return tags;
}

function getBerlinOldPrice(values: Partial<Record<BerlinAttributeKey, BerlinAttributeValue>>): number | null {
  const raw = values.old_price;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) return raw;
  if (typeof raw === "string") {
    const num = Number(raw.trim());
    if (Number.isFinite(num) && num >= 0) return num;
  }
  return null;
}

async function getBerlinAttributeMap(
  deps: RoutesDependencies,
  tenantId: string,
  itemIds: string[]
): Promise<BerlinAttributeMap> {
  if (itemIds.length === 0) return new Map();
  const values = await deps.prisma.attributeValue.findMany({
    where: {
      tenantId,
      itemId: { in: itemIds },
      definition: { key: { in: BERLIN_ATTRIBUTE_KEYS as unknown as string[] } },
    },
    include: { definition: { select: { key: true } } },
  });

  const map: BerlinAttributeMap = new Map();
  for (const row of values) {
    const key = row.definition?.key as BerlinAttributeKey | undefined;
    if (!key) continue;
    let value: BerlinAttributeValue | null = null;
    if (row.valueString !== null && row.valueString !== undefined) value = row.valueString;
    else if (row.valueNumber !== null && row.valueNumber !== undefined) value = row.valueNumber;
    else if (row.valueBool !== null && row.valueBool !== undefined) value = row.valueBool;
    else if (row.valueDate !== null && row.valueDate !== undefined) value = row.valueDate.toISOString();
    if (value === null) continue;

    if (!map.has(row.itemId)) map.set(row.itemId, {});
    map.get(row.itemId)![key] = value;
  }

  return map;
}

export async function routesMenu(
  app: FastifyInstance,
  deps: RoutesDependencies
) {
  app.get<{ Querystring: { branchSlug: string } }>("/menu/items", async (req, reply) => {
    try {
      const tenant = validateTenant(req);
      const isBerlin = tenant.slug === BERLIN_TENANT_SLUG;
      const berlinLocale = isBerlin ? resolveBerlinLocale(req.headers["x-am-locale"]) : null;
      if (!requireStorefrontFeature(req, reply, "menu")) return;

      // Require branchSlug for tenant resolution
      const { branchSlug } = req.query as { branchSlug?: string };
      if (!branchSlug) {
        return reply.code(400).send({ error: "Missing branchSlug parameter" });
      }

      // Resolve Branch (need id for Offer lookup)
      const branch = await deps.prisma.branch.findFirst({
        where: { slug: branchSlug, tenantId: tenant.id },
        select: { id: true, tenantId: true }
      });

      if (!branch || !branch.tenantId) {
        return reply.code(404).send({ error: "Branch not found or invalid context" });
      }

      const tenantId = branch.tenantId;
      const key = CacheKeys.menuItems(tenantId, branchSlug, berlinLocale ?? undefined);

      const r = await getOrSet(
        deps.cache,
        key,
        deps.ttlSec,
        deps.staleSec,
        async () => {
          // Phase 4.2: Menu items only from Offer (price/availability from Offer only); one row per item (default variant)
          const offers = await deps.prisma.offer.findMany({
            where: {
              tenantId,
              branchId: branch.id,
              isAvailable: true,
              variant: { isDefault: true }
            },
            select: {
              priceCents: true,
              variant: {
                select: {
                  catalogItem: {
                    select: {
                      id: true,
                      slug: true,
                      title: true,
                      imageUrl: true,
                      desc: true,
                      weightG: true,
                      categoryId: true,
                      category: { select: { slug: true, isAvailable: true } }
                    }
                  }
                }
              }
            }
          });

          const attributeMap = isBerlin
            ? await getBerlinAttributeMap(
                deps,
                tenantId,
                offers.map((o) => o.variant.catalogItem.id)
              )
            : new Map<string, Partial<Record<BerlinAttributeKey, BerlinAttributeValue>>>();

          const mappedItems = offers.map((o) => {
            const item = o.variant.catalogItem;
            const meta = isBerlin ? attributeMap.get(item.id) : undefined;
            const tags = meta ? buildBerlinTags(meta, berlinLocale) : undefined;
            const oldPrice = meta ? getBerlinOldPrice(meta) : null;
            const localizedTitle = isBerlin && meta
              ? pickBerlinLocalized(meta, berlinLocale, "title", item.title)
              : item.title;
            const localizedDesc = isBerlin && meta
              ? pickBerlinLocalized(meta, berlinLocale, "desc", item.desc ?? "")
              : item.desc ?? "";
            const categorySlug = item.category?.isAvailable ? item.category.slug : "uncategorized";
            return {
              id: item.id,
              slug: item.slug,
              title: localizedTitle,
              price: moneyFromMinor(o.priceCents),
              oldPrice: oldPrice ?? undefined,
              imageUrl: item.imageUrl,
              desc: localizedDesc,
              weightG: item.weightG ?? undefined,
              tags: tags && tags.length ? tags : undefined,
              categorySlug,
              categoryId: item.categoryId,
              isAvailable: true
            };
          });

          return { items: mappedItems };
        },
        { swr: deps.swr, onRevalidateError: (e) => req.log.error({ err: e }, "menu items revalidate failed") }
      );

      const dataToValidate = r.data;

      const parsed = zMenuItemsPayload.safeParse(dataToValidate);
      if (!parsed.success) {
        if (req.log) {
          req.log.error({
            validationError: parsed.error.format(),
            requestBody: req.body,
            endpoint: "/menu/items"
          }, "Menu items validation failed");
        }
        return reply.code(400).send({ error: "Menu items schema validation failed", details: parsed.error.format() });
      }

      if (deps.metrics) {
        deps.metrics.cacheResult.inc({ key, result: r.from });
      }

      reply.header("x-cache", r.from);
      reply.header("x-cache-age", String(Math.floor(r.ageSec)));

      return parsed.data;
    } catch (error) {
      req.log.error({ error, branchSlug: req.query.branchSlug }, "Failed to fetch menu items");
      return reply.code(500).send({ error: "Failed to fetch menu items" });
    }
  });

  app.get<{ Querystring: { branchSlug: string } }>("/menu", async (req, reply) => {
    try {
      const tenant = validateTenant(req);
      const isBerlin = tenant.slug === BERLIN_TENANT_SLUG;
      const berlinLocale = isBerlin ? resolveBerlinLocale(req.headers["x-am-locale"]) : null;
      if (!requireStorefrontFeature(req, reply, "menu")) return;

      // Require branchSlug for tenant resolution
      const { branchSlug } = req.query as { branchSlug?: string };
      if (!branchSlug) {
        return reply.code(400).send({ error: "Missing branchSlug parameter" });
      }

      // Resolve Branch (need id for Offer lookup)
      const branch = await deps.prisma.branch.findFirst({
        where: { slug: branchSlug, tenantId: tenant.id },
        select: { id: true, tenantId: true }
      });

      if (!branch || !branch.tenantId) {
        return reply.code(404).send({ error: "Branch not found or invalid context" });
      }

      const tenantId = branch.tenantId;
      const key = CacheKeys.menu(tenantId, branchSlug, berlinLocale ?? undefined);

      const r = await getOrSet(
        deps.cache,
        key,
        deps.ttlSec,
        deps.staleSec,
        async () => {
          // 1. Fetch Categories
          const categories = await deps.prisma.category.findMany({
            where: { isAvailable: true, tenantId },
            orderBy: { sortOrder: "asc" }
          });
          const mappedCategories = categories.map(mapCategory);
          const categoryMap = new Map(categories.map(c => [c.id, c]));

          // 2. Phase 4.2: Menu items only from Offer (price/availability from Offer only); one row per item (default variant)
          const offers = await deps.prisma.offer.findMany({
            where: {
              tenantId,
              branchId: branch.id,
              isAvailable: true,
              variant: { isDefault: true }
            },
            select: {
              priceCents: true,
              variantId: true,
              variant: {
                select: {
                  catalogItemId: true,
                  catalogItem: {
                    select: {
                      id: true,
                      slug: true,
                      title: true,
                      imageUrl: true,
                      desc: true,
                      weightG: true,
                      categoryId: true
                    }
                  }
                }
              }
            }
          });

          const attributeMap = isBerlin
            ? await getBerlinAttributeMap(
                deps,
                tenantId,
                offers.map((o) => o.variant.catalogItem.id)
              )
            : new Map<string, Partial<Record<BerlinAttributeKey, BerlinAttributeValue>>>();

          const mappedItems = offers.map((o) => {
            const item = o.variant.catalogItem;
            const cat = categoryMap.get(item.categoryId);
            const meta = isBerlin ? attributeMap.get(item.id) : undefined;
            const tags = meta ? buildBerlinTags(meta, berlinLocale) : undefined;
            const oldPrice = meta ? getBerlinOldPrice(meta) : null;
            const localizedTitle = isBerlin && meta
              ? pickBerlinLocalized(meta, berlinLocale, "title", item.title)
              : item.title;
            const localizedDesc = isBerlin && meta
              ? pickBerlinLocalized(meta, berlinLocale, "desc", item.desc ?? "")
              : item.desc ?? "";
            return {
              id: item.id,
              slug: item.slug,
              title: localizedTitle,
              price: moneyFromMinor(o.priceCents),
              oldPrice: oldPrice ?? undefined,
              imageUrl: item.imageUrl,
              desc: localizedDesc,
              weightG: item.weightG ?? undefined,
              tags: tags && tags.length ? tags : undefined,
              categorySlug: cat ? cat.slug : "uncategorized",
              categoryId: item.categoryId,
              isAvailable: true
            };
          });

          return {
            categories: mappedCategories,
            items: mappedItems
          };
        },
        { swr: deps.swr, onRevalidateError: (e) => req.log.error({ err: e }, "menu revalidate failed") }
      );

      const dataToValidate = r.data;

      const parsed = zMenuResponse.safeParse(dataToValidate);
      if (!parsed.success) {
        // Fastify logger is runtime-decorated property

        if (req.log) {
          req.log.error({
            validationError: parsed.error.format(),
            requestBody: req.body,
            endpoint: '/menu'
          }, 'Menu validation failed');
        }
        return reply.code(400).send({ error: "Menu schema validation failed", details: parsed.error.format() });
      }

      if (deps.metrics) {
        deps.metrics.cacheResult.inc({ key, result: r.from });
      }

      reply.header("x-cache", r.from);
      reply.header("x-cache-age", String(Math.floor(r.ageSec)));

      return parsed.data;
    } catch (error) {
      req.log.error({ error, branchSlug: req.query.branchSlug }, "Failed to fetch menu");
      return reply.code(500).send({ error: "Failed to fetch menu" });
    }
  });

  // Fastify request casting - params validated by route schema
  app.get<{ Params: { slug: string }, Querystring: { branchSlug: string } }>("/menu/category/:slug", async (req, reply) => {
    try {
      const { slug } = req.params;
      const { branchSlug } = req.query as { branchSlug?: string };

      // SECURITY FIX: Require branchSlug to resolve tenant
      if (!branchSlug) {
        return reply.code(400).send({ error: "Missing branchSlug parameter" });
      }

      const branch = await deps.prisma.branch.findFirst({
        where: { slug: branchSlug, tenantId: req.tenant!.id },
        select: { id: true, tenantId: true }
      });

      if (!branch) return reply.code(404).send({ error: "Branch not found" });

      const category = await deps.prisma.category.findFirst({
        where: { slug, tenantId: branch.tenantId }
      });

      if (!category) return reply.code(404).send({ error: "Category not found" });

      // Phase 4.2: Only items with Offer for this branch (price from Offer)
      const offers = await deps.prisma.offer.findMany({
        where: {
          tenantId: branch.tenantId,
          branchId: branch.id,
          isAvailable: true,
          variant: { isDefault: true, catalogItem: { categoryId: category.id } }
        },
        select: {
          priceCents: true,
          variant: {
            select: {
              catalogItem: {
                select: {
                  id: true,
                  slug: true,
                  title: true,
                  imageUrl: true,
                  desc: true,
                  weightG: true,
                  categoryId: true
                }
              }
            }
          }
        }
      });

      const berlinLocale = req.tenant?.slug === BERLIN_TENANT_SLUG
        ? resolveBerlinLocale(req.headers["x-am-locale"])
        : null;
      const attributeMap = branch.tenantId && req.tenant?.slug === BERLIN_TENANT_SLUG
        ? await getBerlinAttributeMap(
            deps,
            branch.tenantId,
            offers.map((o) => o.variant.catalogItem.id)
          )
        : new Map<string, Partial<Record<BerlinAttributeKey, BerlinAttributeValue>>>();

      const mappedCategory = mapCategory(category);
      const mappedItems = offers.map((o) => {
        const item = o.variant.catalogItem;
        const meta = attributeMap.get(item.id);
        const tags = meta ? buildBerlinTags(meta, berlinLocale) : undefined;
        const oldPrice = meta ? getBerlinOldPrice(meta) : null;
        const localizedTitle = meta
          ? pickBerlinLocalized(meta, berlinLocale, "title", item.title)
          : item.title;
        const localizedDesc = meta
          ? pickBerlinLocalized(meta, berlinLocale, "desc", item.desc ?? "")
          : item.desc ?? "";
        return {
          id: item.id,
          slug: item.slug,
          title: localizedTitle,
          price: moneyFromMinor(o.priceCents),
          oldPrice: oldPrice ?? undefined,
          imageUrl: item.imageUrl,
          desc: localizedDesc,
          weightG: item.weightG ?? undefined,
          tags: tags && tags.length ? tags : undefined,
          categorySlug: category.slug,
          categoryId: item.categoryId,
          isAvailable: true
        };
      });

      return { category: mappedCategory, items: mappedItems };
    } catch (error) {
      req.log.error({ error, categorySlug: req.params.slug, branchSlug: req.query.branchSlug }, "Failed to fetch category menu");
      return reply.code(500).send({ error: "Failed to fetch category" });
    }
  });

  app.get<{ Params: { slug: string }, Querystring: { branchSlug: string } }>("/menu/category/:slug/summary", async (req, reply) => {
    try {
      const { slug } = req.params;
      const { branchSlug } = req.query as { branchSlug?: string };

      if (!branchSlug) {
        return reply.code(400).send({ error: "Missing branchSlug parameter" });
      }

      const branch = await deps.prisma.branch.findFirst({
        where: { slug: branchSlug, tenantId: req.tenant!.id },
        select: { id: true, tenantId: true }
      });

      if (!branch) return reply.code(404).send({ error: "Branch not found" });

      const category = await deps.prisma.category.findFirst({
        where: { slug, tenantId: branch.tenantId }
      });

      if (!category) return reply.code(404).send({ error: "Category not found" });

      const offers = await deps.prisma.offer.findMany({
        where: {
          tenantId: branch.tenantId,
          branchId: branch.id,
          isAvailable: true,
          variant: { isDefault: true, catalogItem: { categoryId: category.id } }
        },
        select: {
          priceCents: true,
          variant: {
            select: {
              catalogItem: {
                select: {
                  id: true,
                  slug: true,
                  title: true,
                  imageUrl: true,
                  desc: true,
                  weightG: true,
                  categoryId: true
                }
              }
            }
          }
        }
      });

      const berlinLocale = req.tenant?.slug === BERLIN_TENANT_SLUG
        ? resolveBerlinLocale(req.headers["x-am-locale"])
        : null;
      const attributeMap = branch.tenantId && req.tenant?.slug === BERLIN_TENANT_SLUG
        ? await getBerlinAttributeMap(
            deps,
            branch.tenantId,
            offers.map((o) => o.variant.catalogItem.id)
          )
        : new Map<string, Partial<Record<BerlinAttributeKey, BerlinAttributeValue>>>();

      const mappedCategory = mapCategory(category);
      const mappedItems = offers.map((o) => {
        const item = o.variant.catalogItem;
        const meta = attributeMap.get(item.id);
        const tags = meta ? buildBerlinTags(meta, berlinLocale) : undefined;
        const localizedTitle = meta
          ? pickBerlinLocalized(meta, berlinLocale, "title", item.title)
          : item.title;
        return {
          id: item.id,
          slug: item.slug,
          title: localizedTitle,
          price: moneyFromMinor(o.priceCents),
          imageUrl: item.imageUrl,
          tags: tags && tags.length ? tags : undefined,
          categorySlug: category.slug,
          categoryId: item.categoryId,
        };
      });

      const payload = { category: mappedCategory, items: mappedItems };
      const parsed = zMenuCategorySummaryPayload.safeParse(payload);
      if (!parsed.success) {
        if (req.log) {
          req.log.error({
            validationError: parsed.error.format(),
            requestBody: req.body,
            endpoint: "/menu/category/:slug/summary"
          }, "Menu category summary validation failed");
        }
        return reply.code(400).send({ error: "Menu category summary schema validation failed", details: parsed.error.format() });
      }

      return parsed.data;
    } catch (error) {
      req.log.error({ error, categorySlug: req.params.slug, branchSlug: req.query.branchSlug }, "Failed to fetch category summary");
      return reply.code(500).send({ error: "Failed to fetch category summary" });
    }
  });

  // Fastify request casting - params validated by route schema
  app.get<{ Params: { id: string }, Querystring: { branchSlug: string } }>("/menu/item/:id", async (req, reply) => {
    try {
      const { id } = req.params;
      const { branchSlug } = req.query as { branchSlug?: string };

      // SECURITY FIX: Require branchSlug to resolve tenant
      if (!branchSlug) {
        return reply.code(400).send({ error: "Missing branchSlug parameter" });
      }

      const branch = await deps.prisma.branch.findFirst({
        where: { slug: branchSlug, tenantId: req.tenant!.id },
        select: { id: true, tenantId: true }
      });

      if (!branch) return reply.code(404).send({ error: "Branch not found" });

      // Phase 4.2: Item with price from Offer for this branch (must have Offer and isAvailable)
      const offer = await deps.prisma.offer.findFirst({
        where: {
          tenantId: branch.tenantId,
          branchId: branch.id,
          isAvailable: true,
          variant: {
            isDefault: true,
            catalogItem: {
              OR: [{ id }, { slug: id }],
              status: "ACTIVE",
              tenantId: branch.tenantId
            }
          }
        },
        select: {
          priceCents: true,
          variant: {
            select: {
              catalogItem: {
                select: {
                  id: true,
                  slug: true,
                  title: true,
                  imageUrl: true,
                  desc: true,
                  weightG: true,
                  categoryId: true,
                  category: { select: { slug: true } }
                }
              }
            }
          }
        }
      });

      if (!offer) return reply.code(404).send({ error: "Item not found" });

      const item = offer.variant.catalogItem;

      const berlinLocale = req.tenant?.slug === BERLIN_TENANT_SLUG
        ? resolveBerlinLocale(req.headers["x-am-locale"])
        : null;
      const attributeMap = req.tenant?.slug === BERLIN_TENANT_SLUG
        ? await getBerlinAttributeMap(deps, branch.tenantId, [item.id])
        : new Map<string, Partial<Record<BerlinAttributeKey, BerlinAttributeValue>>>();
      const meta = attributeMap.get(item.id);
      const tags = meta ? buildBerlinTags(meta, berlinLocale) : undefined;
      const oldPrice = meta ? getBerlinOldPrice(meta) : null;
      const localizedTitle = meta
        ? pickBerlinLocalized(meta, berlinLocale, "title", item.title)
        : item.title;
      const localizedDesc = meta
        ? pickBerlinLocalized(meta, berlinLocale, "desc", item.desc ?? "")
        : item.desc ?? "";

      return {
        id: item.id,
        slug: item.slug,
        title: localizedTitle,
        price: moneyFromMinor(offer.priceCents),
        oldPrice: oldPrice ?? undefined,
        imageUrl: item.imageUrl,
        desc: localizedDesc,
        weightG: item.weightG ?? undefined,
        tags: tags && tags.length ? tags : undefined,
        categorySlug: item.category?.slug ?? "uncategorized",
        categoryId: item.categoryId,
        isAvailable: true
      };
    } catch (error) {
      req.log.error({ error, itemId: req.params.id, branchSlug: req.query.branchSlug }, "Failed to fetch menu item");
      return reply.code(500).send({ error: "Failed to fetch menu item" });
    }
  });
}
