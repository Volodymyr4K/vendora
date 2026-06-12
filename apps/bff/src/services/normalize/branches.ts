import { unwrap, slugify, SafeRecord } from "./util.js";

export type NormalizeOpts = { unwrapKeys: string[] };

function pickStr(obj: unknown, keys: string[]): string | undefined {
  const rec = obj as SafeRecord;
  for (const k of keys) {
    const v = rec?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

export function normalizeBranches(rawInput: unknown, opts: NormalizeOpts) {
  const raw0 = unwrap(rawInput, opts.unwrapKeys);
  const rec0 = raw0 as SafeRecord;

  let arr: unknown[] = [];
  if (Array.isArray(raw0)) {
    arr = raw0;
  } else if (rec0 && typeof rec0 === "object") {
    const candidate = rec0.items ?? rec0.branches ?? rec0.data;
    if (Array.isArray(candidate)) arr = candidate;
  }

  const out = arr
    .map((x) => {
      const slug = pickStr(x, ["slug", "branchSlug", "id", "code"]) ?? slugify(pickStr(x, ["name", "city", "cityName"]) ?? "");
      const cityName = pickStr(x, ["cityName", "city", "name", "title"]) ?? "";
      return { slug, cityName };
    })
    .filter((x) => typeof x.slug === "string" && x.slug.length > 0 && typeof x.cityName === "string" && x.cityName.length > 0);
  return out;
}
