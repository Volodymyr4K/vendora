import { PrismaClient } from "@prisma/client";
import { AM_CONTENT_DEFAULTS } from "../apps/web/lib/am-content-defaults";

const TENANT_SLUG = "berlin-press";

type JsonValue = null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue };

function isPlainObject(value: unknown): value is Record<string, JsonValue> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeDeep(base: JsonValue, override: JsonValue): JsonValue {
    if (override === undefined || override === null) return base;
    if (Array.isArray(base) || Array.isArray(override)) return override;
    if (isPlainObject(base) && isPlainObject(override)) {
        const result: Record<string, JsonValue> = { ...base };
        for (const [key, overrideValue] of Object.entries(override)) {
            if (overrideValue === undefined) continue;
            const baseValue = (base as Record<string, JsonValue>)[key];
            result[key] = mergeDeep(baseValue ?? null, overrideValue);
        }
        return result;
    }
    return override;
}

function stableSort(value: JsonValue): JsonValue {
    if (Array.isArray(value)) return value.map(stableSort);
    if (isPlainObject(value)) {
        const sorted: Record<string, JsonValue> = {};
        for (const key of Object.keys(value).sort()) {
            sorted[key] = stableSort(value[key]);
        }
        return sorted;
    }
    return value;
}

function stableStringify(value: JsonValue): string {
    return JSON.stringify(stableSort(value));
}

async function main() {
    const apply = process.argv.includes("--apply");
    const prisma = new PrismaClient();
    try {
        const tenant = await prisma.tenant.findUnique({
            where: { slug: TENANT_SLUG },
            select: { id: true, slug: true, settings: true },
        });

        if (!tenant) {
            console.error(`Tenant not found: ${TENANT_SLUG}`);
            process.exit(1);
        }

        const settings = (tenant.settings ?? {}) as Record<string, JsonValue>;
        const existingAmContent = settings.amContent;

        if (existingAmContent !== undefined && existingAmContent !== null && !isPlainObject(existingAmContent)) {
            console.error("Existing amContent is not an object. Aborting to avoid overwriting unexpected data.");
            process.exit(1);
        }

        const merged = mergeDeep(AM_CONTENT_DEFAULTS as unknown as JsonValue, (existingAmContent ?? null) as JsonValue);
        const nextSettings = {
            ...settings,
            amContent: merged,
        } as Record<string, JsonValue>;

        const before = stableStringify(settings);
        const after = stableStringify(nextSettings);

        if (before === after) {
            console.log("No changes required. Tenant settings already contain amContent defaults.");
            return;
        }

        if (!apply) {
            console.log("Dry run: changes detected but not applied.");
            console.log("Re-run with --apply to persist.");
            return;
        }

        await prisma.tenant.update({
            where: { id: tenant.id },
            data: { settings: nextSettings },
        });

        console.log("amContent defaults merged successfully for", TENANT_SLUG);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
});
