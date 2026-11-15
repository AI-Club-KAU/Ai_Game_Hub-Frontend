import { test, expect } from "./fixtures";
import { isolateNetwork } from "./network-isolation";
import { TEST_API_BASE_URL, TEST_ORIGIN } from "./test-environment";
import { createConnection } from "node:net";

test("Node transport is offline even without an injected fixture", async () => {
  await expect(fetch("https://unmocked.invalid/students/register")).rejects.toThrow("Offline validation blocked");
  expect(() => createConnection({host:"unmocked.invalid",port:443})).toThrow("Offline validation blocked");
});

test("unmocked API and arbitrary external destinations are blocked before the network", async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const blocked: string[] = [];
  await isolateNetwork(context, TEST_ORIGIN, blocked);
  const page = await context.newPage();
  try {
    await page.goto(TEST_ORIGIN);
    for (const url of [TEST_API_BASE_URL + "/students/register", "https://unexpected.invalid/attempts/finish", TEST_ORIGIN + "/functions/v1/attempts/start"]) {
      expect(await page.evaluate(async url => { try { await fetch(url, {method:"POST",body:"{}"}); return false; } catch { return true; } }, url)).toBe(true);
    }
    expect(blocked).toHaveLength(3);
  } finally { await context.close(); }
});

test("non-forwarding proxy also blocks an explicit route.continue bypass", async ({ page }) => {
  await page.route("https://proxy-probe.invalid/**", route => route.continue());
  const failed = page.waitForEvent("requestfailed", request => request.url().startsWith("https://proxy-probe.invalid/"));
  await page.goto("https://proxy-probe.invalid/").catch(() => {});
  expect((await failed).failure()?.errorText).toContain("ERR_");
});
