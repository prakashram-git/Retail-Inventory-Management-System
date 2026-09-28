import { z } from "zod";

/**
 * Constants/types shared between the server-only DB read (lib/theme/typography.ts)
 * and the client-side settings form (TypographySettingsCard) — kept in their own
 * module, without a "server-only" import, so the client component can use them.
 * Mirrors the split CLAUDE.md documents for Server Action + client schema pairs.
 */
export const FONT_FAMILIES = ["geist", "inter", "merriweather"] as const;
export type FontFamily = (typeof FONT_FAMILIES)[number];

export const FONT_SIZES = ["small", "medium", "large"] as const;
export type FontSize = (typeof FONT_SIZES)[number];

export const FONT_FAMILY_LABELS: Record<FontFamily, string> = {
  geist: "Geist (Default)",
  inter: "Inter",
  merriweather: "Merriweather (Serif)",
};

export const FONT_SIZE_LABELS: Record<FontSize, string> = {
  small: "Small",
  medium: "Medium (Default)",
  large: "Large",
};

/** Root <html> font-size percentage; Tailwind's rem-based utilities scale off this. */
export const FONT_SIZE_PERCENT: Record<FontSize, string> = {
  small: "87.5%",
  medium: "100%",
  large: "112.5%",
};

export const typographySettingsSchema = z.object({
  form_font_family: z.enum(FONT_FAMILIES),
  form_font_size: z.enum(FONT_SIZES),
});

export type TypographySettings = z.infer<typeof typographySettingsSchema>;
