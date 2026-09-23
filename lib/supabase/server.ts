import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Next.js 16 made `cookies()` fully async (no sync fallback), so this must
 * be awaited here rather than accessed synchronously as in the Next 14 API.
 * `setAll` is wrapped in try/catch because Server Components can't write
 * cookies — the write is a no-op there and is instead handled by proxy.ts
 * refreshing the session on every request.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component — session refresh is handled
            // by proxy.ts instead.
          }
        },
      },
    }
  );
}
