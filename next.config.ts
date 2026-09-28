import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  // The help-sync cron hashes UI source files at runtime; make sure they ship.
  outputFileTracingIncludes: {
    "/api/cron/help-sync": ["./components/**/*.tsx", "./app/pos/page.tsx", "./lib/pos/checkout.ts"],
    "/dashboard/settings/help": ["./components/**/*.tsx", "./app/pos/page.tsx", "./lib/pos/checkout.ts"],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "dexie"],
  },
  // Stores moved from a Settings tab to its own top-level route — this keeps
  // any existing bookmark/browser-history entry working instead of dead-ending
  // on a bare, chrome-less 404.
  async redirects() {
    return [
      {
        source: "/dashboard/settings/stores",
        destination: "/dashboard/stores",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
