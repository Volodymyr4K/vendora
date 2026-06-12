import { z } from "zod";

// Shared URL validator (STRICT)
// Must be http... OR starts with /uploads/ or /media/ or objectKey (t/...)
const urlOrRelativePathStrict = z.string()
    .min(1)
    .refine(val => (
        val.startsWith("http") ||
        val.startsWith("/uploads/") ||
        val.startsWith("/media/") ||
        val.startsWith("t/")
    ), {
        message: "Image URL must be a valid URL or a relative path starting with /uploads/, /media/, or an objectKey starting with t/"
    });

// Helper for nullable/optional URL with empty string handling (UX friendly)
const strictImageField = z.preprocess(
    (val) => (val === "" ? null : val),
    urlOrRelativePathStrict.nullable().optional()
);

export const zAdminProductCreate = z.object({
    title: z.string().min(2),
    categoryId: z.string(),
    price: z.number().positive().describe("Price in Major Units (e.g. 150.50)"),
    weightG: z.number().int().nonnegative().optional().describe("Weight in grams"),
    desc: z.string().optional(),
    // Option A: Optional + Nullable + Preprocess (Empty string -> null)
    imageUrl: strictImageField,
});

export const zAdminProductUpdate = z.object({
    title: z.string().min(2).optional(),
    categoryId: z.string().optional(),
    price: z.number().positive().describe("Price in Major Units (e.g. 150.50)").optional(),
    weightG: z.number().int().nonnegative().optional().describe("Weight in grams"),
    desc: z.string().optional(),
    // Same logic: strict if string, but handles empty/null/undefined safely
    imageUrl: strictImageField,
});

// Infer types
export type AdminProductCreate = z.infer<typeof zAdminProductCreate>;
export type AdminProductUpdate = z.infer<typeof zAdminProductUpdate>;
