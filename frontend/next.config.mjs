const nextConfig = {
  agentRules: false,
  output: "standalone",
  poweredByHeader: false,
  async rewrites() {
    if (process.env.NEXT_PUBLIC_API_URL !== "same-origin") return [];
    const backend = process.env.API_INTERNAL_URL;
    if (!backend)
      throw new Error("Same-origin API routing requires API_INTERNAL_URL");
    const target = new URL(backend);
    if (
      !["http:", "https:"].includes(target.protocol) ||
      target.username ||
      target.password ||
      target.search ||
      target.hash ||
      target.pathname !== "/"
    )
      throw new Error(
        "API_INTERNAL_URL must be an HTTP(S) origin without credentials",
      );
    return [
      { source: "/api/:path*", destination: `${target.origin}/api/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default nextConfig;
