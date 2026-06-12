import { PrismaClient } from "@prisma/client";
import { AM_LOCALES, zAmContentV1, type AmLocaleKey } from "@vendora/contracts";

type LocalizedString = { de?: string; en?: string; ru?: string };

function parseArgs(argv: string[]) {
  const args: { tenantSlug?: string; apply: boolean; limit?: number } = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      return { ...args, help: true as const };
    }
    if (a === "--tenantSlug" || a === "--tenant" || a === "-t") {
      args.tenantSlug = argv[i + 1];
      i++;
      continue;
    }
    if (a === "--apply") {
      args.apply = true;
      continue;
    }
    if (a === "--limit") {
      const n = Number(argv[i + 1]);
      if (Number.isFinite(n) && n > 0) args.limit = Math.floor(n);
      i++;
      continue;
    }
  }
  return args;
}

function usage() {
  return [
    "Import AM Content journal items into JournalPost drafts.",
    "",
    "Usage:",
    "  pnpm -C packages/database db:import:journal:amcontent -- --tenantSlug berlin-press [--limit 10] [--apply]",
    "",
    "Notes:",
    "  - Default mode is DRY RUN (no writes). Use --apply to write.",
    "  - Imported posts are created as DRAFT with empty markdown (cannot be published until filled).",
    "  - Initial slug includes the AM Content item id to make the import idempotent; you can edit slug before publish.",
  ].join("\n");
}

function normalizeLocale(value: string): AmLocaleKey {
  const primary = value.split(/[-_]/)[0] ?? value;
  const v = primary.toLowerCase();
  if (v === "de" || v === "en" || v === "ru") return v;
  return "en";
}

function pickLocalized(val: LocalizedString | undefined, locale: AmLocaleKey): string | null {
  if (!val) return null;
  const v = (val as Record<string, unknown>)[locale];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function slugify(input: string): string {
  const ascii = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return ascii
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function run() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  if ("help" in args) {
    console.log(usage());
    return;
  }
  if (!args.tenantSlug) {
    console.error("Missing --tenantSlug");
    console.log("");
    console.log(usage());
    process.exitCode = 2;
    return;
  }

  const prisma = new PrismaClient();
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { slug: args.tenantSlug },
      select: { id: true, slug: true, settings: true },
    });
    if (!tenant) {
      throw new Error(`Tenant not found: ${args.tenantSlug}`);
    }

    const settings = tenant.settings as unknown as Record<string, unknown> | null;
    const amContentRaw = settings?.amContent;
    const parsed = zAmContentV1.safeParse(amContentRaw);
    if (!parsed.success) {
      throw new Error("Tenant.settings.amContent is missing/invalid (zAmContentV1 parse failed)");
    }

    const items = parsed.data.journal?.items ?? [];
    const limit = args.limit ? Math.min(args.limit, items.length) : items.length;

    console.log(`[journal-import] tenant=${tenant.slug} items=${items.length} mode=${args.apply ? "APPLY" : "DRY_RUN"} limit=${limit}`);

    let created = 0;
    let skipped = 0;
    let empty = 0;

    for (let idx = 0; idx < limit; idx++) {
      const item = items[idx]!;

      // Choose a stable seed title
      const titleEn = pickLocalized(item.title as LocalizedString | undefined, "en");
      const titleDe = pickLocalized(item.title as LocalizedString | undefined, "de");
      const titleRu = pickLocalized(item.title as LocalizedString | undefined, "ru");
      const titleSeed = titleEn ?? titleDe ?? titleRu ?? "journal-post";

      // Make slug deterministic and idempotent by including the AM item id.
      const baseSlug = slugify(`${titleSeed}-${item.id}`);
      const slug = baseSlug || slugify(`journal-post-${item.id}`) || `journal-post-${idx + 1}`;

      const existing = await prisma.journalPost.findFirst({
        where: { tenantId: tenant.id, slug },
        select: { id: true },
      });
      if (existing) {
        skipped++;
        console.log(`[skip] ${slug} (already exists)`);
        continue;
      }

      const translations = AM_LOCALES.flatMap((rawLocale) => {
        const locale = normalizeLocale(rawLocale);
        const title = pickLocalized(item.title as LocalizedString | undefined, locale);
        if (!title) return [];

        const date = pickLocalized(item.date as LocalizedString | undefined, locale);
        const preview = pickLocalized(item.preview as LocalizedString | undefined, locale);
        const excerpt = [date, preview].filter(Boolean).join(" — ").trim() || null;

        return [
          {
            locale,
            title,
            excerpt,
            markdown: "", // keep empty so publish cannot succeed until content is written
          },
        ];
      });

      if (translations.length === 0) {
        empty++;
        console.log(`[empty] ${slug} (no localized titles found)`);
        continue;
      }

      if (!args.apply) {
        created++;
        console.log(`[dry] create ${slug} translations=${translations.map((t) => t.locale).join(",")}`);
        continue;
      }

      await prisma.journalPost.create({
        data: {
          tenantId: tenant.id,
          slug,
          status: "DRAFT",
          publishedAt: null,
          coverImageKey: null,
          translations: {
            create: translations,
          },
        },
        select: { id: true },
      });

      created++;
      console.log(`[ok] created ${slug} translations=${translations.map((t) => t.locale).join(",")}`);
    }

    console.log(`[journal-import] done created=${created} skipped=${skipped} empty=${empty}`);
    if (!args.apply) {
      console.log("[journal-import] DRY RUN: re-run with --apply to write");
    }
  } finally {
    await prisma.$disconnect();
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

