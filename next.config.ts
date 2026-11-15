import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  // Docker uses standalone; local pnpm start retains its usual behavior.
  output: process.env.BUILD_STANDALONE === "true" ? "standalone" : undefined,
  // The opaque game iframe must be able to read its public font files without same-origin privileges.
  headers() {
    return [{ source: "/games/dev-run/assets/fonts/:file", headers: [{ key: "Access-Control-Allow-Origin", value: "*" }] }];
  },
};
export default config;
