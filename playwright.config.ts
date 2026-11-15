import "./scripts/offline-network-guard.cjs";
import { defineConfig } from "@playwright/test";
import { TEST_ORIGIN } from "./tests/test-environment";

const mode = process.env.NEXT_PUBLIC_API_MODE;
if (mode !== "mock" && mode !== "live") throw new Error("Tests require explicit NEXT_PUBLIC_API_MODE=mock or live");

export default defineConfig({
  testDir: "./tests",
  outputDir: `test-results/${mode}`,
  testMatch: process.env.NEXT_PUBLIC_API_MODE === "mock" ? "**/*.spec.ts" : "**/backend*.spec.ts",
  testIgnore: process.env.NEXT_PUBLIC_API_MODE === "mock" ? "**/backend*.spec.ts" : [],
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: TEST_ORIGIN,
    serviceWorkers: "block",
    browserName: "chromium",
    channel: "chrome",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `"${process.execPath}" scripts/run-isolated-next.mjs dev ${mode} ${new URL(TEST_ORIGIN).port}`,
    url: TEST_ORIGIN,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
