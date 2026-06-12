import crypto from "node:crypto";

const UA_MAP: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh", з: "z", и: "y", і: "i", ї: "i", й: "i",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch",
  ш: "sh", щ: "shch", ь: "", ю: "iu", я: "ia",
  ё: "e", э: "e", ы: "y", ъ: "", "’": "", "'": "", "`": "", "´": "", "ʼ": "", "“": "", "”": ""
};

export function slugify(input: string): string {
  const s = String(input ?? "").trim().toLowerCase();
  if (!s) return "unknown";
  const tr = s
    .split("")
    .map((ch) => UA_MAP[ch] ?? (/[a-z0-9]/.test(ch) ? ch : " "))
    .join("");
  return tr
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-") || "unknown";
}

export type SafeRecord = Record<string, unknown>;

export function toNumber(x: unknown): number | undefined {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string") {
    const cleaned = x.replace(/,/g, ".").replace(/[^\d.]/g, "");
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export function absUrl(baseUrl: string | undefined, maybe: unknown): string | undefined {
  if (!maybe) return undefined;
  const s = String(maybe);
  if (/^https?:\/\//i.test(s)) return s;
  if (!baseUrl) return undefined;
  try {
    return new URL(s, baseUrl).toString();
  } catch {
    return undefined;
  }
}

export function unwrap(raw: unknown, keys: string[]): unknown {
  let cur = raw;
  for (let i = 0; i < 4; i++) {
    if (!cur || typeof cur !== "object") break;
    const rec = cur as SafeRecord;
    const found = keys.find((k) => k in rec);
    if (!found) break;
    cur = rec[found];
  }
  return cur;
}

export function stableId(parts: Array<string | number | undefined | null>): string {
  const s = parts.map((p) => String(p ?? "")).join("|");
  return crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);
}
