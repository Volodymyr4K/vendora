import { z } from "zod";

export const AM_LOCALES = ["de", "en"] as const;
export type AmLocaleKey = (typeof AM_LOCALES)[number];

export const zLocalizedString = z
  .object({
    de: z.string().min(1).optional(),
    en: z.string().min(1).optional(),
  })
  .refine((val) => Boolean(val.de || val.en), {
    message: "At least one locale value is required",
  });

const zInternalHref = z.string().min(1).startsWith("/");
const zExternalHref = z.string().url();
const zAnyHref = z.union([zInternalHref, zExternalHref]);

const zLinkInternal = z.object({
  id: z.string().min(1),
  label: zLocalizedString,
  href: zInternalHref,
});

const zLinkExternal = z.object({
  id: z.string().min(1),
  label: zLocalizedString,
  externalHref: zExternalHref,
});

const zTickerItem = z.object({
  id: z.string().min(1),
  text: zLocalizedString,
});

const zStatItem = z.object({
  id: z.string().min(1),
  value: z.string().min(1),
  label: zLocalizedString,
});

const zLocalizedStringOrString = z.union([zLocalizedString, z.string().min(1)]);

const zUi = z
  .object({
    common: z
      .object({
        noImage: zLocalizedString.optional(),
        standard: zLocalizedString.optional(),
        featured: zLocalizedString.optional(),
        est: zLocalizedString.optional(),
        close: zLocalizedString.optional(),
        itemsLabel: zLocalizedString.optional(),
        notificationLabel: zLocalizedString.optional(),
      })
      .strict()
      .optional(),
    nav: z
      .object({
        catalog: zLocalizedString.optional(),
        authors: zLocalizedString.optional(),
        about: zLocalizedString.optional(),
        media: zLocalizedString.optional(),
        preorder: zLocalizedString.optional(),
        noResults: zLocalizedString.optional(),
        homeCrumb: zLocalizedString.optional(),
        journalTag: zLocalizedString.optional(),
      })
      .strict()
      .optional(),
    search: z
      .object({
        search: zLocalizedString.optional(),
        recentSearches: zLocalizedString.optional(),
        clearHistory: zLocalizedString.optional(),
        emptyArchive: zLocalizedString.optional(),
        trending: zLocalizedString.optional(),
        quickLinks: z
          .object({
            philosophy: zLocalizedString.optional(),
            art: zLocalizedString.optional(),
            newest: zLocalizedString.optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    cart: z
      .object({
        yourOrder: zLocalizedString.optional(),
        empty: zLocalizedString.optional(),
        summary: zLocalizedString.optional(),
        total: zLocalizedString.optional(),
        remove: zLocalizedString.optional(),
        itemNo: zLocalizedString.optional(),
      })
      .strict()
      .optional(),
    catalog: z
      .object({
        archiveInventory: zLocalizedString.optional(),
        titleAll: zLocalizedString.optional(),
        categoryLabel: zLocalizedString.optional(),
        sortBy: zLocalizedString.optional(),
        viewGrid: zLocalizedString.optional(),
        viewList: zLocalizedString.optional(),
        showingResults: zLocalizedString.optional(),
        openSystem: zLocalizedString.optional(),
        sortOptions: z
          .object({
            default: zLocalizedString.optional(),
            newest: zLocalizedString.optional(),
            priceAsc: zLocalizedString.optional(),
            priceDesc: zLocalizedString.optional(),
            alphaAsc: zLocalizedString.optional(),
          })
          .strict()
          .optional(),
        filters: z
          .object({
            title: zLocalizedString.optional(),
            priceRange: zLocalizedString.optional(),
            apply: zLocalizedString.optional(),
            availability: zLocalizedString.optional(),
            inStock: zLocalizedString.optional(),
            format: zLocalizedString.optional(),
            authors: zLocalizedString.optional(),
            noResults: zLocalizedString.optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    product: z
      .object({
        addToCart: zLocalizedString.optional(),
        makePreorder: zLocalizedString.optional(),
        preorder: zLocalizedString.optional(),
        new: zLocalizedString.optional(),
        bestseller: zLocalizedString.optional(),
        outOfStock: zLocalizedString.optional(),
        byAuthor: zLocalizedString.optional(),
        inStock: zLocalizedString.optional(),
        details: z
          .object({
            year: zLocalizedString.optional(),
            pages: zLocalizedString.optional(),
          })
          .strict()
          .optional(),
        youMayLike: zLocalizedString.optional(),
        backToCatalog: zLocalizedString.optional(),
        format: z
          .object({
            hardcover: zLocalizedString.optional(),
            paperback: zLocalizedString.optional(),
            digital: zLocalizedString.optional(),
            specialEdition: zLocalizedString.optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const zHeader = z
  .object({
    brand: z
      .object({
        text: zLocalizedString.optional(),
        logoUrl: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
    nav: z
      .array(
        z
          .object({
            id: z.string().min(1),
            label: zLocalizedString.optional(),
            href: zInternalHref,
          })
          .strict()
      )
      .optional(),
  })
  .strict();

const zHomepage = z
  .object({
    // Visibility flags (no magic locale fallbacks; explicit show/hide is safer than "empty string" semantics)
    newArrivalsHeadingEnabled: z.boolean().optional(),
    viewAllLinkEnabled: z.boolean().optional(),
    hero: z
      .object({
        eyebrow: zLocalizedString.optional(),
        title: zLocalizedString.optional(),
        subtitle: zLocalizedString.optional(),
        ctaText: zLocalizedString.optional(),
        ctaHref: zInternalHref.optional(),
        imageUrl: z.string().min(1).optional(),
        imageAlt: zLocalizedString.optional(),
      })
      .optional(),
    ticker: z.array(zTickerItem).optional(),
    featured: z
      .object({
        label: zLocalizedString.optional(),
        title: zLocalizedString.optional(),
        href: zInternalHref.optional(),
      })
      .optional(),
    stats: z.array(zStatItem).optional(),
    newArrivalsTitle: zLocalizedString.optional(),
    marqueeVertical: zLocalizedString.optional(),
    editorialTitle: zLocalizedString.optional(),
    editorialDesc: zLocalizedString.optional(),
    editorialImageUrl: z.string().min(1).optional(),
    editorialImageAlt: zLocalizedString.optional(),
    viewAllLabel: zLocalizedString.optional(),
    viewAllHref: zInternalHref.optional(),
  })
  .strict();

const zAbout = z
  .object({
    eyebrow: zLocalizedString.optional(),
    title: zLocalizedString.optional(),
    text: zLocalizedString.optional(),
    missionTitle: zLocalizedString.optional(),
    p1: zLocalizedString.optional(),
    p2: zLocalizedString.optional(),
    teamTitle: zLocalizedString.optional(),
    hqLabel: zLocalizedString.optional(),
    heroImageUrl: z.string().min(1).optional(),
    heroImageAlt: zLocalizedString.optional(),
    facts: z.array(zStatItem).optional(),
    teamMembers: z
      .array(
        z.object({
          id: z.string().min(1),
          name: zLocalizedString,
          role: zLocalizedString,
          imageUrl: z.string().min(1),
        })
      )
      .optional(),
  })
  .strict();

const zMedia = z
  .object({
    title: zLocalizedString.optional(),
    subtitle: zLocalizedString.optional(),
    kitTitle: zLocalizedString.optional(),
    kitDesc: zLocalizedString.optional(),
    downloadText: zLocalizedString.optional(),
    /** Press kit download link (e.g. /media/... or https://... or mailto:...) */
    kitHref: zAnyHref.optional(),
    reviewTitle: zLocalizedString.optional(),
    reviewDesc: zLocalizedString.optional(),
    contactPrText: zLocalizedString.optional(),
    /** Review copy contact link (e.g. mailto:..., /..., https://...) */
    contactPrHref: zAnyHref.optional(),
    mentionsTitle: zLocalizedString.optional(),
    interviewTitle: zLocalizedString.optional(),
    interviewDesc: zLocalizedString.optional(),
    interviewCta: zLocalizedString.optional(),
    /** Interview request CTA link (e.g. mailto:..., /..., https://...) */
    interviewHref: zAnyHref.optional(),
    /** Toggle for the "Recent Mentions" section. Default: enabled. */
    mentionsEnabled: z.boolean().optional(),
    mentions: z
      .array(
        z
          .object({
            id: z.string().min(1),
            outlet: zLocalizedStringOrString.optional(),
            title: zLocalizedStringOrString.optional(),
            date: zLocalizedStringOrString.optional(),
            icon: z.enum(["globe", "user", "badge"]).optional(),
            href: z.string().min(1).optional(),
          })
          .strict()
      )
      .optional(),
    items: z
      .array(
        z.object({
          id: z.string().min(1),
          name: zLocalizedString.optional(),
          logoUrl: z.string().min(1),
          externalHref: zExternalHref.optional(),
        })
      )
      .optional(),
  })
  .strict();

const zLegalPage = z
  .object({
    title: zLocalizedString.optional(),
    subtitle: zLocalizedString.optional(),
    /** Full page content in Markdown (rendered server-side). */
    bodyMarkdown: zLocalizedString.optional(),
  })
  .strict();

const zLegal = z
  .object({
    impressum: zLegalPage.optional(),
    terms: zLegalPage.optional(),
    privacy: zLegalPage.optional(),
  })
  .strict();

const zFooter = z
  .object({
    brandTitle: zLocalizedString.optional(),
    brandText: zLocalizedString.optional(),
    directoryTitle: zLocalizedString.optional(),
    directoryLinks: z.array(zLinkInternal).optional(),
    subscribeTitle: zLocalizedString.optional(),
    subscribeSpan: zLocalizedString.optional(),
    emailPlaceholder: zLocalizedString.optional(),
    submitLabel: zLocalizedString.optional(),
    socialTitle: zLocalizedString.optional(),
    socialLinks: z.array(zLinkExternal).optional(),
    legalLinks: z.array(zLinkInternal).optional(),
    copyright: zLocalizedStringOrString.optional(),
  })
  .strict();

const zJournal = z
  .object({
    title: zLocalizedString.optional(),
    subtitle: zLocalizedString.optional(),
    items: z
      .array(
        z.object({
          id: z.string().min(1),
          date: zLocalizedString.optional(),
          title: zLocalizedString.optional(),
          preview: zLocalizedString.optional(),
        })
      )
      .optional(),
    archiveToast: zLocalizedString.optional(),
  })
  .strict();

const zAuthors = z
  .object({
    title: zLocalizedString.optional(),
    subtitle: zLocalizedString.optional(),
    manifestoLabel: zLocalizedString.optional(),
    whatWePublishTitle: zLocalizedString.optional(),
    p1: zLocalizedString.optional(),
    p2: zLocalizedString.optional(),
    proseTitle: zLocalizedString.optional(),
    proseSub: zLocalizedString.optional(),
    poetryTitle: zLocalizedString.optional(),
    poetrySub: zLocalizedString.optional(),
    essaysTitle: zLocalizedString.optional(),
    essaysSub: zLocalizedString.optional(),
    processTitle: zLocalizedString.optional(),
    steps: z
      .array(
        z.object({
          id: z.string().min(1),
          title: zLocalizedString.optional(),
          desc: zLocalizedString.optional(),
        })
      )
      .optional(),
    ctaText: zLocalizedString.optional(),
    ctaSub: zLocalizedString.optional(),
    ctaButtonText: zLocalizedString.optional(),
    ctaNote: zLocalizedString.optional(),
    ctaHref: zExternalHref.optional(),
  })
  .strict();

export const zAmContentV1 = z
  .object({
    version: z.literal(1),
    ui: zUi.optional(),
    header: zHeader.optional(),
    homepage: zHomepage.optional(),
    about: zAbout.optional(),
    media: zMedia.optional(),
    legal: zLegal.optional(),
    footer: zFooter.optional(),
    journal: zJournal.optional(),
    authors: zAuthors.optional(),
  })
  .strict();

export type AmContentV1 = z.infer<typeof zAmContentV1>;
