import Image from "next/image";
import { cookies } from "next/headers";
import { ACTIVE_STORE_COOKIE } from "@/lib/constants";
import { resolveLoginAppearance } from "@/lib/appearance/resolve";
import { LoginCard } from "@/components/login/LoginCard";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const cookieStore = await cookies();
  const activeStoreId = cookieStore.get(ACTIVE_STORE_COOKIE)?.value ?? null;
  const appearance = await resolveLoginAppearance(activeStoreId);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950 p-4">
      <Image
        src={appearance.home_background_url}
        alt=""
        fill
        priority
        className="object-cover"
      />

      {/* Ambient vignette so the frosted card reads clearly against any wallpaper. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.55)_100%)]" />

      <div
        style={{
          backdropFilter: `blur(${appearance.blur_strength}px)`,
          backgroundColor: `rgba(0, 0, 0, ${appearance.overlay_opacity})`,
        }}
        className="absolute inset-0 pointer-events-none"
      />

      <div className="relative z-10">
        <LoginCard />
      </div>
    </main>
  );
}
