import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, Merriweather } from "next/font/google";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";
import { createClient } from "@/lib/supabase/server";
import { getTypographySettings, FONT_SIZE_PERCENT, type FontFamily } from "@/lib/theme/typography";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const merriweather = Merriweather({
  variable: "--font-merriweather",
  subsets: ["latin"],
  weight: ["300", "400", "700"],
});

// Selectable via Settings > Appearance (super_admin only, lib/theme/typography.ts).
// Keys must match FONT_FAMILIES there.
const FONT_STACKS: Record<FontFamily, string> = {
  geist: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
  inter: "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
  merriweather: "var(--font-merriweather), ui-serif, Georgia, serif",
};

export const metadata: Metadata = {
  title: "Mall Retail System",
  description: "Multi-store point of sale, inventory, and reporting platform.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const typography = await getTypographySettings(supabase);

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${merriweather.variable} h-full antialiased`}
      style={{
        // @theme inline in globals.css maps the font-sans utility straight
        // through to this variable, and html { font-size } cascades through
        // Tailwind's rem-based utilities — so both reach every form in the
        // app without each component needing to know about this setting.
        "--font-sans": FONT_STACKS[typography.form_font_family],
        fontSize: FONT_SIZE_PERCENT[typography.form_font_size],
      } as CSSProperties}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
