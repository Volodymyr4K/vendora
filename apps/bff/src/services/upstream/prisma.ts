
import { Upstream, UpstreamContext } from "../upstream.js";
import { prisma, PrismaClient } from "@vendora/database";
import {
    zMenuResponse as _zMenuResponse,
    zDeliveryResponse as _zDeliveryResponse,
    zDeliveryCfg as _zDeliveryCfg,
    zWorkingSchedule
} from "@vendora/contracts";
import { normalizeMenu as _normalizeMenu } from "../normalize/index.js";
import { moneyFromMinor } from "../../utils/money.js";

export class PrismaUpstream implements Upstream {
    constructor(private db: PrismaClient = prisma) { }

    async getBranches(ctx: UpstreamContext) {
        if (!ctx.tenantId) {
            throw new Error("tenantId required in UpstreamContext for PrismaUpstream.getBranches");
        }
        const branches = await this.db.branch.findMany({
            where: { tenantId: ctx.tenantId, isActive: true },
            select: { slug: true, cityName: true, phones: true, address: true },
        });
        return branches;
    }

    async getBranch(branchSlug: string, ctx: UpstreamContext) {
        if (!ctx.tenantId) {
            throw new Error("tenantId required in UpstreamContext for PrismaUpstream.getBranch");
        }
        const b = await this.db.branch.findFirst({ where: { slug: branchSlug, tenantId: ctx.tenantId } });
        if (!b || !b.isActive) throw new Error("Branch not found");

        return {
            slug: b.slug,
            cityName: b.cityName,
            address: b.address || undefined,
            phones: b.phones,
            workingSchedule: b.workingSchedule == null ? undefined : zWorkingSchedule.parse(b.workingSchedule),
        };
    }

    async getMenu(ctx: UpstreamContext) {
        if (!ctx.tenantId) {
            throw new Error("tenantId required in UpstreamContext for PrismaUpstream.getMenu");
        }
        const categories = await this.db.category.findMany({
            where: { tenantId: ctx.tenantId, isAvailable: true },
            orderBy: { sortOrder: "asc" },
            include: {
                catalogItems: {
                    where: { tenantId: ctx.tenantId, status: "ACTIVE" },
                },
            },
        });

        const cats = categories.map((c) => ({
            id: c.id,
            slug: c.slug,
            title: c.title,
            isAvailable: c.isAvailable,
        }));

        const items = categories.flatMap((c) =>
            c.catalogItems.map((p) => ({
                id: p.id,
                slug: p.slug,
                title: p.title,
                price: moneyFromMinor(p.basePriceCents ?? 0),
                imageUrl: p.imageUrl || undefined,
                desc: p.desc ?? '',
                weightG: p.weightG || undefined,
                categorySlug: c.slug,
                categoryId: c.id,
                isAvailable: p.status === "ACTIVE",
            }))
        );

        return { categories: cats, items };
    }

    async getDelivery(branchSlug: string, ctx: UpstreamContext) {
        if (!ctx.tenantId) {
            throw new Error("tenantId required in UpstreamContext for PrismaUpstream.getDelivery");
        }
        const b = await this.db.branch.findFirst({ where: { slug: branchSlug, tenantId: ctx.tenantId } });
        if (!b || !b.isActive) {
            return { mode: "fallback" as const, message: "Branch not active" };
        }

        return {
            mode: "ok" as const,
            cfg: {
                deliveryFee: moneyFromMinor(b.deliveryFee), // stored as cents -> float
                freeFrom: moneyFromMinor(b.freeFrom),
                etaMin: b.etaMin,
                etaMax: b.etaMax,
                zones: b.zones,
            },
        };
    }
}
