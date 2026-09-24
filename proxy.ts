import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PATHS = ["/login"];

const UI_DESIGNER_ALLOWED_PATHS = [
  "/dashboard",
  "/dashboard/settings",
  "/dashboard/settings/appearance",
  "/dashboard/settings/layout-builder",
  "/dashboard/settings/account",
];

/**
 * Next.js 16 renamed the `middleware` file convention to `proxy` (function
 * must be named `proxy`, edge runtime no longer supported here) — see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md.
 * This still does what a Next 14 `middleware.ts` would: refresh the
 * Supabase session on every request and enforce role-based redirects.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() (not getSession()) revalidates the token against Supabase Auth
  // rather than trusting a potentially-stale cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublicPath = PUBLIC_PATHS.includes(pathname);

  // A redirect response is a fresh object — any session cookies refreshed
  // above via setAll live on `response` and must be copied over explicitly,
  // or the refreshed session is silently lost for the client.
  function redirectWithRefreshedSession(url: URL) {
    const redirectResponse = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });
    return redirectResponse;
  }

  if (!user && !isPublicPath) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect_to", pathname);
    return redirectWithRefreshedSession(loginUrl);
  }

  if (user && (pathname === "/" || pathname.startsWith("/dashboard") || pathname === "/pos")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role === "cashier" && pathname !== "/pos") {
      return redirectWithRefreshedSession(new URL("/pos", request.url));
    }

    // ui_designer is scoped to appearance/layout customization only — no POS,
    // orders, inventory, reports, staff, or store administration. This is a
    // convenience redirect, not the real boundary: the actual enforcement is
    // requireLayoutEditor()/requireStoreContext() on the server actions and
    // the RLS policies in add_ui_designer_role.sql, since a direct POST or a
    // direct Supabase call both bypass this middleware.
    if (profile?.role === "ui_designer" && !UI_DESIGNER_ALLOWED_PATHS.some((p) => pathname === p)) {
      return redirectWithRefreshedSession(new URL("/dashboard/settings/appearance", request.url));
    }

    if (pathname === "/") {
      return redirectWithRefreshedSession(new URL("/dashboard", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
