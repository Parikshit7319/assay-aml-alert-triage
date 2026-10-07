import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // PGlite is only loaded when DATABASE_URL is not a postgres URL; keeping it external leaves it out of the bundle.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Migrations are read from ./drizzle at runtime, which file tracing cannot see. Ship them with every server function (Vercel, standalone).
  outputFileTracingIncludes: { "/*": ["./drizzle/**/*"] },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
