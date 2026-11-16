import { test, expect, type Page } from "./fixtures";
import { getGameAsset } from "../src/features/games/game-assets";

async function open(page: Page) {
  await page.goto("/");await page.locator("#access-code").fill("demo");
  await page.getByRole("button", { name: "الدخول إلى البوث" }).click();await page.getByRole("button", { name: "تجهيز البوث", exact: true }).click();
  await page.getByRole("button", { name: "لوحة المتصدرين", exact: true }).click();
}
test("six accessible tabs retain Overall top-three ties and show ten independent per-game sample rows", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("tab")).toHaveText(["Overall", "ESCAPE.EXE", "Dev Run", "وصّل طريقك", "Game 4", "Game 5"]);
  await page.getByText("إعدادات عرض المتصدرين التجريبية", { exact: true }).click();
  await page.getByLabel("مصدر عرض المتصدرين").selectOption("sample");
  await expect(page.locator(".leaderboard-row")).toHaveCount(3);
  await expect(page.locator(".leaderboard-rank")).toHaveText(["1", "2", "2"]);
  for (const name of ["ESCAPE.EXE", "Dev Run", "وصّل طريقك", "Game 4", "Game 5"]) {
    await page.getByRole("tab", { name, exact: true }).click();
    await expect(page.getByRole("tabpanel")).toHaveAttribute("aria-busy", "true");
    await expect(page.locator(".leaderboard-row")).toHaveCount(10);
    await expect(page.locator(".leaderboard-points strong")).toHaveText(["100", "100", "90", "80", "70", "60", "50", "40", "20", "0"]);
    await expect(page.locator(".leaderboard-name h2").first()).toHaveText("مشارك تجريبي 1");
    await expect(page.locator(".leaderboard-points span").first()).toHaveText("نقطة من 100");
  }
  await expect(page.locator("main")).toContainText("غير متاحة للعب في Live");
  expect(getGameAsset("4", false)).toBeNull();expect(getGameAsset("5", false)).toBeNull();
  await page.getByRole("tab", { name: "Overall", exact: true }).click();
  await expect(page.locator(".leaderboard-row")).toHaveCount(3);
  await expect(page.locator(".leaderboard-points span").first()).toHaveText("نقطة من 500");
});

test("per-game empty, loading, errors, stale responses and responsive keyboard tabs", async ({ page }) => {
  await open(page);await page.getByRole("tab", { name: "ESCAPE.EXE", exact: true }).click();
  await expect(page.getByRole("heading", { name: "لا نتائج بعد" })).toBeVisible();
  await page.getByText("إعدادات عرض المتصدرين التجريبية", { exact: true }).click();
  await page.getByLabel("مصدر عرض المتصدرين").selectOption("sample");
  await page.getByRole("tab", { name: "Dev Run", exact: true }).click();
  await page.getByLabel("مصدر عرض المتصدرين").selectOption("empty");
  await expect(page.getByRole("heading", { name: "لا نتائج بعد" })).toBeVisible();
  await expect(page.locator(".leaderboard-row")).toHaveCount(0);
  await page.getByLabel("مصدر عرض المتصدرين").selectOption("offline");
  await expect(page.getByRole("heading", { name: "تعذّر تحميل المتصدرين" })).toBeVisible();
  await page.getByRole("button", { name: "إعادة المحاولة", exact: true }).click();
  await expect(page.getByRole("heading", { name: "تعذّر تحميل المتصدرين" })).toBeVisible();
  await page.getByLabel("مصدر عرض المتصدرين").selectOption("sample");
  await expect(page.locator(".leaderboard-row")).toHaveCount(10);
  await page.getByRole("tab", { name: "Dev Run", exact: true }).focus();await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "وصّل طريقك", exact: true })).toBeFocused();
  await expect(page.getByRole("tab", { name: "وصّل طريقك", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");await expect(page.getByRole("tab", { name: "Game 5", exact: true })).toBeFocused();
  await page.keyboard.press("Home");await expect(page.getByRole("tab", { name: "Overall", exact: true })).toBeFocused();
  await expect(page.locator(".leaderboard-row")).toHaveCount(3);
  await page.screenshot({ path: "test-results/leaderboards-tabs-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "وصّل طريقك", exact: true }).click();
  await expect(page.locator(".leaderboard-row")).toHaveCount(10);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/leaderboards-tabs-mobile.png", fullPage: true });
});
