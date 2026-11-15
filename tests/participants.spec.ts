import { test, expect, type Page } from "./fixtures";
async function enterBooth(page: Page) {
  await page.goto("/");
  await page.locator("#access-code").fill("demo");
  await page.getByRole("button", { name: "الدخول إلى البوث" }).click();
  await page.getByRole("button", { name: "تجهيز البوث", exact: true }).click();
  await expect(page.getByRole("heading", { name: /البوث جاهز/ })).toBeFocused();
}
test("register, preserve leading zeros, prevent duplicate and retrieve unchanged data", async ({ page }) => {
  await enterBooth(page);
  await page.getByRole("button", { name: "تسجيل المشارك", exact: true }).click();
  await expect(page.locator("#participant-error")).toContainText("الاسم الكامل");
  await page.locator("#participant-name").fill("اسم تجريبي جديد");
  await page.locator("#participant-id").fill("12x");
  await page.getByRole("button", { name: "تسجيل المشارك", exact: true }).click();
  await expect(page.locator("#participant-error")).toContainText("أرقام فقط");
  await page.locator("#participant-id").fill("٠٠٠٧");
  await page.getByRole("button", { name: "تسجيل المشارك", exact: true }).click();
  await expect(page.getByRole("button", { name: "جارٍ تنفيذ الطلب…" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "قفل البوث" })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "تم تسجيل المشارك" })).toBeFocused();
  await expect(page.locator("dd").last()).toHaveText("0007");
  await page.getByRole("button", { name: "تجهيز مشارك آخر" }).click();
  await expect(page.locator("#participant-name")).toHaveValue("");
  await expect(page.getByText("اسم تجريبي جديد", { exact: true })).toHaveCount(0);
  await page.locator("#participant-name").fill("اسم آخر");
  await page.locator("#participant-id").fill("0007");
  await page.getByRole("button", { name: "تسجيل المشارك", exact: true }).click();
  await expect(page.locator("#participant-error")).toContainText("مسجّل بالفعل");
  await page.getByRole("button", { name: "مشارك سابق", exact: true }).click();
  await expect(page.locator("#participant-name")).toHaveCount(0);
  await expect(page.locator("#participant-id")).toHaveValue("");
  await page.locator("#participant-id").fill("0007");
  await page.locator("#participant-id").press("Enter");
  await expect(page.getByRole("heading", { name: "تم استرجاع المشارك" })).toBeVisible();
  await expect(page.locator("dd").first()).toHaveText("اسم تجريبي جديد");
  await page.screenshot({ path: "tmp/qa/participant-success.png", fullPage: true, caret: "initial" });
});
test("missing participant and connection failure never imply success; retry works", async ({ page }) => {
  await enterBooth(page);
  await page.getByRole("button", { name: "مشارك سابق", exact: true }).click();
  await page.locator("#participant-id").fill("99999");
  await page.getByRole("button", { name: "استرجاع المشارك", exact: true }).click();
  await expect(page.locator("#participant-error")).toContainText("لم نعثر");
  await page.locator("#participant-id").fill("00123");
  await page.getByRole("checkbox", { name: "محاكاة تعذّر الاتصال" }).check();
  await page.getByRole("button", { name: "استرجاع المشارك", exact: true }).click();
  await expect(page.locator("#participant-error")).toContainText("لم نتأكد");
  await expect(page.locator(".participant-details")).toHaveCount(0);
  await expect(page.locator("#participant-id")).toHaveValue("00123");
  await page.getByRole("checkbox", { name: "محاكاة تعذّر الاتصال" }).uncheck();
  await page.getByRole("button", { name: "استرجاع المشارك", exact: true }).click();
  await expect(page.locator("dd").first()).toHaveText("مشارك تجريبي");
  await page.getByRole("button", { name: "قفل البوث" }).click();
  await expect(page.locator("#access-code")).toBeVisible();
  await expect(page.getByText("مشارك تجريبي", { exact: true })).toHaveCount(0);
});
test("reset, lock and reload clear participant UI; layout fits mobile", async ({ page }) => {
  await enterBooth(page);
  await page.locator("#participant-name").fill("اسم مؤقت");
  await page.locator("#participant-id").fill("0000001");
  await page.getByRole("button", { name: "مسح البيانات" }).click();
  await expect(page.locator("#participant-name")).toHaveValue("");
  await expect(page.locator("#participant-id")).toHaveValue("");
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'tmp/qa/participants-' + width + '.png', fullPage: true, caret: "initial" });
  }
  await page.locator("#participant-name").fill("اسم مؤقت");
  await page.reload();
  await expect(page.locator("#access-code")).toBeVisible();
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
});
