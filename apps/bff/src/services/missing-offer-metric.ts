/**
 * Phase 4 DoD: missing_offer metric.
 *
 * Computes count of (tenantId, branchId, variantId) pairs that are "must-have"
 * (visible in menu: ACTIVE item + default variant available + category visible at branch)
 * but have no Offer. 0 = normal; >0 = alert.
 *
 * Run periodically (e.g. every 5 min) to update the gauge.
 */

import type { PrismaClient } from "@vendora/database";
import type { Gauge } from "prom-client";
import { logger } from "../lib/logger.js";
import { missingOfferLastSuccessTimestamp } from "../lib/metrics.js";

function key(t: string, b: string, v: string): string {
  return `${t}:${b}:${v}`;
}

/**
 * Compute count of must-have (tenantId, branchId, variantId) pairs without an Offer.
 * Must-have = CatalogItem.status ACTIVE + ItemVariant.isDefault + isAvailable + category
 * linked to branch via CategoryBranch.
 */
export async function computeMissingOfferCount(prisma: PrismaClient): Promise<number> {
  const branchCategories = await prisma.categoryBranch.findMany({
    where: { category: { isAvailable: true } },
    select: { tenantId: true, branchId: true, categoryId: true }
  });
  const categoryIds = [...new Set(branchCategories.map((row) => row.categoryId))];
  if (categoryIds.length === 0) return 0;

  const itemsWithVariants = await prisma.catalogItem.findMany({
    where: {
      status: "ACTIVE",
      categoryId: { in: categoryIds },
      variants: {
        some: { isDefault: true, isAvailable: true }
      }
    },
    select: {
      tenantId: true,
      categoryId: true,
      variants: {
        where: { isDefault: true, isAvailable: true },
        select: { id: true }
      }
    }
  });

  const mustHaveKeys = new Set<string>();
  for (const item of itemsWithVariants) {
    const variantId = item.variants[0]?.id;
    if (!variantId) continue;
    for (const bc of branchCategories) {
      if (bc.tenantId === item.tenantId && bc.categoryId === item.categoryId) {
        mustHaveKeys.add(key(bc.tenantId, bc.branchId, variantId));
      }
    }
  }

  const offers = await prisma.offer.findMany({
    select: { tenantId: true, branchId: true, variantId: true }
  });
  for (const o of offers) {
    mustHaveKeys.delete(key(o.tenantId, o.branchId, o.variantId));
  }

  return mustHaveKeys.size;
}

/**
 * Update the missing_offer gauge. Call from a periodic job.
 * On success, also sets missing_offer_last_success_timestamp_seconds for alert freshness.
 */
export async function updateMissingOfferMetric(
  prisma: PrismaClient,
  gauge: Gauge<string>
): Promise<void> {
  const count = await computeMissingOfferCount(prisma);
  gauge.set(count);
  missingOfferLastSuccessTimestamp.set(Math.floor(Date.now() / 1000));
}

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Start periodic job that updates missing_offer gauge.
 * No-op if gauge is undefined (metrics disabled).
 * Multi-replica: each BFF instance has its own gauge; Prometheus scrapes per instance;
 * alert on missing_offer > 0 on any instance (do not aggregate/sum across replicas).
 */
export function startMissingOfferMetricJob(
  prisma: PrismaClient,
  gauge: Gauge<string> | undefined,
  opts?: { intervalMs?: number; startupDelayMs?: number }
): void {
  if (!gauge) return;

  const intervalMs =
    opts?.intervalMs && opts.intervalMs > 0 ? Math.floor(opts.intervalMs) : DEFAULT_INTERVAL_MS;
  const startupDelayMs =
    opts?.startupDelayMs && opts.startupDelayMs > 0 ? Math.floor(opts.startupDelayMs) : 0;

  const run = () => {
    updateMissingOfferMetric(prisma, gauge).catch((err) => {
      logger.error({ err }, "[missing_offer] Metric update failed; next run will retry");
    });
  };

  if (startupDelayMs > 0) {
    setTimeout(() => {
      run();
      setInterval(run, intervalMs);
    }, startupDelayMs);
    return;
  }

  run(); // run once on start
  setInterval(run, intervalMs);
}
