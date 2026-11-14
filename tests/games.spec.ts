import { test, expect, type Page } from "@playwright/test";
async function prepare(page: Page) {
  await page.goto("/");
  await page.locator("#access-code").fill("demo");
  await page.getByRole("button", { name: "الدخول إلى البوث" }).click();
  await page.getByRole("button", { name: "تجهيز البوث", exact: true }).click();
  await page.getByRole("button", { name: "مشارك سابق", exact: true }).click();
  await page.locator("#participant-id").fill("00123");
  await page.getByRole("button", { name: "استرجاع المشارك", exact: true }).click();
  await page.getByRole("radio", { name: /لعبة تجريبية 03/ }).check();
  await page.getByRole("button", { name: "تأكيد اختيار اللعبة" }).click();
  await expect(page.getByRole("button", { name: "ابدأ اللعب", exact: true })).toBeEnabled();
}
async function demoMode(page: Page, mode: string) {
  await page.getByText("محاكاة خدمة بدء المحاولة", { exact: true }).click();
  await page.getByLabel("استجابة خدمة البدء").selectOption(mode);
}
async function returnToStaff(page: Page) {
  await page.getByRole("button", { name: "طلب مساعدة" }).click();
  await page.getByRole("button", { name: "العودة إلى شاشة الموظف" }).click();
}
test("Start approval precedes isolated local game, private fields and staff UI stay hidden", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await prepare(page);
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "استئناف المحاولة" })).toHaveCount(0);
  await page.getByRole("button", { name: "ابدأ اللعب", exact: true }).click();
  await expect(page.locator(".attempt-panel")).toContainText("جارٍ اعتماد بدء المحاولة");
  await expect(page.getByRole("button", { name: "قفل البوث" })).toBeDisabled();
  await expect(page.locator(".game-mode-footer")).toContainText("الحاوية جاهزة");
  await expect(page.getByRole("button", { name: "قفل البوث" })).toHaveCount(0);
  await expect(page.getByText("00123", { exact: true })).toHaveCount(0);
  await expect(page.locator("iframe")).toHaveAttribute("sandbox", "allow-scripts");
  expect(await page.locator("iframe").getAttribute("src")).not.toContain("00123");
  const game = page.frameLocator('iframe[title="حاوية اللعبة"]');
  await game.getByRole("button", { name: "اختبار التفاعل" }).click();
  await expect(game.locator("#feedback")).toContainText("عدد النقرات: 1");
  await page.screenshot({ path: "tmp/qa/game-desktop.png", fullPage: true, caret: "initial" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "tmp/qa/game-mobile.png", fullPage: true, caret: "initial" });
  await returnToStaff(page);
  await page.getByRole("button", { name: "استئناف المحاولة" }).click();
  await expect(page.locator(".game-mode-footer")).toContainText("الحاوية جاهزة");
  expect(errors).toEqual([]);
});
test("lost Start response requires inspection and resumes existing attempt", async ({ page }) => {
  await prepare(page);
  await demoMode(page, "lost-response");
  await page.getByRole("button", { name: "ابدأ اللعب", exact: true }).click();
  await expect(page.locator(".attempt-message")).toContainText("لم يصل تأكيد البدء");
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "ابدأ اللعب", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "التحقق من حالة المحاولة" }).click();
  await expect(page.getByRole("radio", { name: /لعبة تجريبية 03/ })).toBeDisabled();
  await page.getByRole("button", { name: "استئناف المحاولة" }).click();
  await expect(page.locator(".game-mode-footer")).toContainText("الحاوية جاهزة");
  await returnToStaff(page);
  await page.getByRole("button", { name: "قفل البوث" }).click();
  await page.locator("#access-code").fill("demo");
  await page.getByRole("button", { name: "الدخول إلى البوث" }).click();
  await page.getByRole("button", { name: "تجهيز البوث", exact: true }).click();
  await page.getByRole("button", { name: "مشارك سابق", exact: true }).click();
  await page.locator("#participant-id").fill("00123");
  await page.getByRole("button", { name: "استرجاع المشارك", exact: true }).click();
  await expect(page.getByRole("button", { name: "استئناف المحاولة" })).toBeVisible();
  await expect(page.locator('input[name="eligible-game"]:enabled')).toHaveCount(4);
});
test("offline and rejected Start do not launch a game", async ({ page }) => {
  await prepare(page);
  await demoMode(page, "offline");
  await page.getByRole("button", { name: "ابدأ اللعب", exact: true }).click();
  await page.getByRole("button", { name: "التحقق من حالة المحاولة" }).click();
  await expect(page.locator(".attempt-message")).toContainText("لم نفترض نجاح");
  await page.getByLabel("استجابة خدمة البدء").selectOption("normal");
  await page.getByRole("button", { name: "التحقق من حالة المحاولة" }).click();
  await expect(page.locator(".attempt-message")).toContainText("لا توجد محاولة نشطة");
  await page.getByLabel("استجابة خدمة البدء").selectOption("rejected");
  await page.getByRole("button", { name: "ابدأ اللعب", exact: true }).click();
  await expect(page.locator(".attempt-message")).toContainText("لم تعتمد الخدمة");
  await expect(page.locator("iframe")).toHaveCount(0);
});
test("missing game asset can be retried without a new Start", async ({ page }) => {
  await prepare(page);
  await page.route("**/games/container-check/index.html", route => route.fulfill({ status: 404, contentType: "text/html", body: "missing" }));
  await page.getByRole("button", { name: "ابدأ اللعب", exact: true }).click();
  await expect(page.getByRole("heading", { name: "تعذّر تحميل صفحة اللعبة" })).toBeVisible();
  await page.unroute("**/games/container-check/index.html");
  await page.getByRole("button", { name: "إعادة تحميل الحاوية" }).click();
  await expect(page.locator(".game-mode-footer")).toContainText("الحاوية جاهزة");
});
test("untrusted score messages never become readiness or saved results", async ({ page }) => {
  await prepare(page);
  await page.route("**/games/container-check/check.js", route => route.fulfill({ contentType: "text/javascript", body: 'parent.postMessage({type:"game:score",score:100},location.origin);' }));
  await page.getByRole("button", { name: "ابدأ اللعب", exact: true }).click();
  await expect(page.locator("iframe")).toBeAttached();
  await page.evaluate(() => window.postMessage({ type: "ai-hub:container-check-ready", version: 0, nonce: new URL(document.querySelector("iframe")!.src).searchParams.get("nonce") }, "*"));
  await expect(page.getByRole("heading", { name: "تعذّر تحميل صفحة اللعبة" })).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".game-mode-footer")).not.toContainText("الحاوية جاهزة");
});
