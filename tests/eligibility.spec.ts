import { test, expect, type Page } from "@playwright/test";
async function openEligibility(page: Page) {
  await page.goto("/");
  await page.locator("#access-code").fill("demo");
  await page.getByRole("button", { name: "الدخول إلى البوث" }).click();
  await page.getByRole("button", { name: "تجهيز البوث", exact: true }).click();
  await page.getByRole("button", { name: "مشارك سابق", exact: true }).click();
  await page.locator("#participant-id").fill("00123");
  await page.getByRole("button", { name: "استرجاع المشارك", exact: true }).click();
  await expect(page.locator(".eligibility-status")).toBeVisible();
  await page.getByText("إعدادات العرض التجريبي", { exact: true }).click();
}
const enabledGames = (page: Page) => page.locator('input[name="eligible-game"]:enabled');
test("all five games stay available across days and sections with one selection at a time", async ({ page }) => {
  await openEligibility(page);
  await expect(enabledGames(page)).toHaveCount(5);
  await page.getByLabel("قسم التجربة", { exact: true }).selectOption("female-students");
  await expect(enabledGames(page)).toHaveCount(5);
  await page.getByRole("radio", { name: /لعبة تجريبية 03/ }).check();
  await page.getByRole("radio", { name: /لعبة تجريبية 04/ }).check();
  await expect(page.locator('input[name="eligible-game"]:checked')).toHaveCount(1);
  await page.getByRole("button", { name: "تأكيد اختيار اللعبة" }).click();
  await expect(page.locator(".selection-confirmed")).toContainText("لم تُحجز محاولة");
  await expect(enabledGames(page)).toHaveCount(0);
  await expect(page.locator(".previous-results")).toContainText("لا توجد نتائج");
  await page.getByRole("button", { name: "تغيير الاختيار" }).click();
  await expect(enabledGames(page)).toHaveCount(5);
  await expect(page.locator('input[name="eligible-game"]:checked')).toHaveCount(0);
  await page.getByRole("radio", { name: /لعبة تجريبية 03/ }).check();
  await page.getByLabel("يوم التجربة", { exact: true }).selectOption("4");
  await expect(enabledGames(page)).toHaveCount(5);
  await expect(page.locator('input[name="eligible-game"]:checked')).toHaveCount(0);
  await expect(page.locator(".selection-review")).toHaveCount(0);
});
test("completed or unfinished game blocks only itself, not other games today", async ({ page }) => {
  await openEligibility(page);
  for (const history of ["played-today","repeated","active"]) {
    await page.getByLabel("سجل تجريبي",{exact:true}).selectOption(history);
    await expect(enabledGames(page)).toHaveCount(4);
    await expect(page.getByRole("radio",{name:/لعبة تجريبية 03/})).toBeDisabled();
    await expect(page.getByRole("radio",{name:/لعبة تجريبية 04/})).toBeEnabled();
  }
  await page.getByLabel("قسم التجربة",{exact:true}).selectOption("female-students");
  await expect(enabledGames(page)).toHaveCount(4);
});
test("approved totals, all five games, and participant reset", async ({ page }) => {
  await openEligibility(page);
  await page.getByLabel("سجل تجريبي", { exact: true }).selectOption("previous");
  await expect(page.locator(".progress-stats")).toContainText("75");
  await expect(page.locator(".previous-results li")).toHaveCount(1);
  await page.getByLabel("سجل تجريبي", { exact: true }).selectOption("complete");
  await expect(page.getByLabel("يوم التجربة", { exact: true })).toHaveValue("3");
  await expect(page.locator(".progress-stats strong").first()).toHaveText("500 / 500");
  await expect(page.locator(".previous-results li")).toHaveCount(5);
  await expect(enabledGames(page)).toHaveCount(0);
  await page.getByRole("button", { name: "تجهيز مشارك آخر" }).click();
  await expect(page.locator(".eligibility-panel")).toHaveCount(0);
  await page.locator("#participant-name").fill("مشارك جديد للاختبار");
  await page.locator("#participant-id").fill("00999");
  await page.getByRole("button", { name: "تسجيل المشارك", exact: true }).click();
  await expect(page.locator(".previous-results")).toContainText("لا توجد نتائج");
  await expect(page.locator(".progress-stats strong").first()).toHaveText("0 / 500");
});
test("loading failure clears choice, retries safely and ignores stale responses", async ({ page }) => {
  await openEligibility(page);
  await page.getByRole("radio", { name: /لعبة تجريبية 03/ }).check();
  await page.getByRole("checkbox", { name: "محاكاة تعذّر تحميل الأهلية" }).check();
  await expect(page.locator(".selection-review")).toHaveCount(0);
  await expect(page.locator(".eligibility-error")).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);
  await page.getByRole("button", { name: "إعادة تحميل الأهلية" }).click();
  await expect(page.locator(".eligibility-error")).toBeVisible();
  await page.getByRole("checkbox", { name: "محاكاة تعذّر تحميل الأهلية" }).uncheck();
  await page.getByLabel("قسم التجربة", { exact: true }).selectOption("female-students");
  await page.getByLabel("قسم التجربة", { exact: true }).selectOption("students");
  await expect(enabledGames(page)).toHaveCount(5);
  await expect(page.locator(".eligibility-context")).toContainText("الطلاب");
  await expect(page.locator('input[name="eligible-game"]:checked')).toHaveCount(0);
});
test("eligibility layout on desktop and mobile has no horizontal overflow", async ({ page }) => {
  await openEligibility(page);
  await page.getByLabel("قسم التجربة", { exact: true }).selectOption("female-students");
  await expect(enabledGames(page)).toHaveCount(5);
  await page.getByRole("radio", { name: /لعبة تجريبية 04/ }).check();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'tmp/qa/eligibility-' + width + '.png', fullPage: true, caret: "initial" });
  }
});
