export * from './schema/timeslots.js';
import { z } from "zod";
export * from "./schema/errors.js";
export * from "./schema/events.js";
export * from "./schema/events-registry.js";
export * from "./schema/am-content.js";
import { AdminProductUpdate } from './schema/admin/products.js';
import { zStorefrontFeatures } from './schema/tenant.js';
import { zResolvedTheme } from './schema/theme-v1.js';

// --- TIME & SCHEDULE SCHEMAS ---

export const zTimeHHmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time format (HH:mm)');

export const zTimeInterval = z.object({
  start: zTimeHHmm,
  end: zTimeHHmm,
});

export const zDaySchedule = z.array(zTimeInterval);

export const zWorkingSchedule = z.object({
  mon: zDaySchedule,
  tue: zDaySchedule,
  wed: zDaySchedule,
  thu: zDaySchedule,
  fri: zDaySchedule,
  sat: zDaySchedule,
  sun: zDaySchedule,
  overrides: z
    .record(
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      zDaySchedule.nullable()
    )
    .optional(),
});

export type TimeHHmm = z.infer<typeof zTimeHHmm>;
export type TimeInterval = z.infer<typeof zTimeInterval>;
export type DaySchedule = z.infer<typeof zDaySchedule>;
export type WorkingSchedule = z.infer<typeof zWorkingSchedule>;

/** BranchConfig — єдина правда для slug → місто/телефони/години/SEO */
/** BranchConfig — єдина правда для slug → місто/телефони/години/SEO */
export const zBranchListItem = z.object({
  slug: z.string().min(1),
  cityName: z.string().min(1),
});

export const zBranchList = z.array(zBranchListItem);
export type BranchListItem = z.infer<typeof zBranchListItem>;

export const zBranchConfig = z.object({
  slug: z.string().min(1),
  cityName: z.string().min(1),
  address: z.string().optional(),
  phones: z.array(z.string()).default([]),
  workingSchedule: zWorkingSchedule.optional(),
  features: zStorefrontFeatures.optional(), // Public subset (version + modules only; no limits/integrations)
  /** GET /branches/:branch response includes tenant (name + theme) from req.tenant; required after Phase 1.8. */
  tenant: z.object({
    name: z.string(),
    theme: zResolvedTheme,
  }),
});

/** Schema for upstream services that do not provide tenant context (added in BFF layer) */
export const zBranchConfigWithoutTenant = zBranchConfig.omit({ tenant: true });
export type BranchConfigWithoutTenant = z.infer<typeof zBranchConfigWithoutTenant>;

/** DeliveryCfg — цифри або валідні значення (без NaN/null) */
export const zDeliveryCfg = z.object({
  deliveryFee: z.number().nonnegative(),
  freeFrom: z.number().nonnegative(),
  etaMin: z.number().int().positive(),
  etaMax: z.number().int().positive(),
  zones: z.array(z.string()).default([]),
});

/** Fallback delivery: коли upstream невалідний/недоступний */
export const zDeliveryFallback = z.object({
  mode: z.literal("fallback"),
  message: z.string().min(1),
});

export const zDeliveryResponse = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("ok"),
    cfg: zDeliveryCfg,
  }),
  zDeliveryFallback,
]);

/** Menu */
export const zMenuCategory = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  isAvailable: z.boolean().optional().default(true),
});

export const zMenuItem = z.object({
  id: z.string().min(1),
  slug: z.string().min(1).optional(),
  title: z.string().min(1),
  price: z.number().nonnegative(),
  // imageUrl може бути абсолютним або відносним (у BFF нормалізуємо до абсолютного)
  imageUrl: z.string().min(1).nullable().optional(),
  imageAlt: z.string().min(1).nullable().optional(),
  desc: z.string().nullish().transform(val => val ?? ''),
  weightG: z.number().int().nonnegative().nullable().optional(),
  tags: z.array(z.string()).optional(),
  oldPrice: z.number().nonnegative().nullable().optional(),
  isAvailable: z.boolean().optional(),
  categorySlug: z.string().min(1), // We will use this for ID too, or add categoryId
  categoryId: z.string().uuid().optional(), // Adding categoryId explicitly for robust matching
});

export const zMenuResponse = z.object({
  categories: z.array(zMenuCategory),
  items: z.array(zMenuItem),
});

export const zMenuItemSummary = z.object({
  id: z.string().min(1),
  slug: z.string().min(1).optional(),
  title: z.string().min(1),
  price: z.number().nonnegative(),
  imageUrl: z.string().min(1).nullable().optional(),
  tags: z.array(z.string()).optional(),
  categorySlug: z.string().min(1),
  categoryId: z.string().uuid().optional(),
});

export const zMenuCategoryPayload = z.object({
  category: zMenuCategory,
  items: z.array(zMenuItem),
});

export type MenuCategoryPayload = z.infer<typeof zMenuCategoryPayload>;

export const zMenuCategorySummaryPayload = z.object({
  category: zMenuCategory,
  items: z.array(zMenuItemSummary),
});

export type MenuCategorySummaryPayload = z.infer<typeof zMenuCategorySummaryPayload>;

export const zMenuItemsPayload = z.object({
  items: z.array(zMenuItem),
});

export type MenuItemsPayload = z.infer<typeof zMenuItemsPayload>;



// --- RE-EXPORTED MODULES ---
export * from './schema/tenant.js';
export * from './schema/theme-v1.js';
export * from './schema/customer.js';
export * from './schema/ordering.js';
// NEW: Admin Schemas (Centralized)
export * from './schema/admin/products.js';
export * from './schema/upstream-ordering.js';

// COMPATIBILITY LAYER (DEPRECATED)
// This ensures that existing code importing zUpdateProductSchema continues to work,
// but uses the new zAdminProductUpdate logic under the hood.
/** @deprecated Use zAdminProductUpdate from ./schema/admin/products */
export { zAdminProductUpdate as zUpdateProductSchema } from './schema/admin/products.js';

export const zToggleProductAvailabilitySchema = z.object({
  isAvailable: z.boolean(),
});

export const zCreateCategorySchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1).optional(), // Can be auto-generated
  sortOrder: z.number().int().default(0),
});

export const zUpdateCategorySchema = z.object({
  title: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
  isAvailable: z.boolean().optional(),
});

export const zToggleCategoryAvailabilitySchema = z.object({
  isAvailable: z.boolean(),
});

export type UpdateProductRequest = AdminProductUpdate;
export type ToggleProductAvailabilityRequest = z.infer<typeof zToggleProductAvailabilitySchema>;
export type CreateCategoryRequest = z.infer<typeof zCreateCategorySchema>;
export type UpdateCategoryRequest = z.infer<typeof zUpdateCategorySchema>;
export type ToggleCategoryAvailabilityRequest = z.infer<typeof zToggleCategoryAvailabilitySchema>;

export const zReorderCategoriesSchema = z.object({
  ids: z.array(z.string())
});

export type ReorderCategoriesRequest = z.infer<typeof zReorderCategoriesSchema>;



export const zBranchSettings = z.object({
  address: z.string().optional(),
  phones: z.array(z.string()).default([]),
  deliveryFee: z.number().nonnegative(),
  freeFrom: z.number().nonnegative(),
  etaMin: z.number().int().positive(),
  etaMax: z.number().int().positive(),
  isActive: z.boolean(),

  // Structured Schedule (Optional for now)
  workingSchedule: zWorkingSchedule.optional(),


  // Timezone - Branch override disabled (always inherits from tenant)
  // Accepts string|null|undefined input but transforms any string to null
  // This prevents branch timezone override at the contracts layer without hard-failing requests
  timezone: z.union([z.string(), z.null(), z.undefined()])
    .transform((val) => {
      // Transform ANY string (including valid tz) into null to disable branch override
      if (typeof val === "string") return null;
      return val;
    }),

  // Scheduled Orders Config
  isScheduledOrderingEnabled: z.boolean().default(true),
  minAdvanceMinutes: z.number().int().min(0).max(1440).default(90),
  prepTimeMinutes: z.number().int().min(5).max(180).default(30),
  slotCapacity: z.number().int().min(1).max(100).default(5),
}).strict();

export type BranchSettings = z.infer<typeof zBranchSettings>;



export const zDashboardStats = z.object({
  meta: z.object({
    isDegraded: z.boolean().describe('Whether stats calculation encountered errors'),
    skippedOrders: z.number().int().nonnegative().describe('Number of orders skipped due to invalid data')
  }),
  revenue: z.number().nonnegative(), // UAH (major units)
  deliveryRevenue: z.number().nonnegative(), // UAH
  avgCheck: z.number().nonnegative(), // UAH
  orders: z.object({
    done: z.number().int().nonnegative(),
    cancelled: z.number().int().nonnegative(),
    inProgress: z.number().int().nonnegative(),
  }),
  topProducts: z.array(z.object({
    title: z.string(),
    count: z.number().int().nonnegative()
  }))
});

export type DashboardStats = z.infer<typeof zDashboardStats>;
export * from './schema/tenant.js';
export * from './schema/customer.js';


export type BranchConfig = z.infer<typeof zBranchConfig>;
export type DeliveryCfg = z.infer<typeof zDeliveryCfg>;
export type DeliveryResponse = z.infer<typeof zDeliveryResponse>;
export type MenuResponse = z.infer<typeof zMenuResponse>;

export * from './schema/ui/theme.js';
