import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  // Docker uses standalone; local pnpm start retains its usual behavior.
  output: process.env.BUILD_STANDALONE === "true" ? "standalone" : undefined,
};
export default config;
