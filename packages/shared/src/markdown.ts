import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { defaultSchema, type Schema } from "hast-util-sanitize";

const journalMarkdownSanitizeSchema: Schema = {
    ...defaultSchema,
    // Prevent link-based XSS / weird protocols.
    protocols: {
        ...defaultSchema.protocols,
        href: ["http", "https", "mailto"],
    },
    // Allow typical formatting + links; keep it conservative (no raw HTML).
    attributes: {
        ...defaultSchema.attributes,
        a: [...(defaultSchema.attributes?.a ?? []), "rel", "target"],
        code: [...(defaultSchema.attributes?.code ?? []), "className"],
    },
};

function normalizeMarkdown(input: string): string {
    // Keep stable behavior across environments; strip null bytes.
    return String(input ?? "").replace(/\0/g, "").trim();
}

/**
 * Canonical Journal markdown renderer (XSS-safe).
 *
 * Policy:
 * - Raw HTML in markdown is NOT allowed (no rehype-raw).
 * - Output is sanitized with a conservative allowlist.
 */
export async function renderJournalMarkdownToHtml(markdown: string): Promise<string> {
    const input = normalizeMarkdown(markdown);
    if (!input) return "";

    const file = await unified()
        .use(remarkParse)
        .use(remarkGfm)
        // Keep raw HTML disabled. We still sanitize the output.
        .use(remarkRehype, { allowDangerousHtml: false })
        .use(rehypeSanitize, journalMarkdownSanitizeSchema)
        .use(rehypeStringify)
        .process(input);

    return String(file.value);
}

