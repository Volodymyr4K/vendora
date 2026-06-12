import { z } from 'zod';

export const zThemeConfig = z.object({
    mode: z.enum(['light', 'dark']).default('light'),
    colors: z.object({
        primary: z.string().regex(/^#/, "Must be hex").describe("Brand primary color"),
        secondary: z.string().optional()
    }),
    fontFamily: z.enum(['Inter', 'Roboto', 'OpenSans']).default('Inter'),
    introductionAnimation: z.boolean().optional(),
}).optional();

export type ThemeConfig = z.infer<typeof zThemeConfig>;
