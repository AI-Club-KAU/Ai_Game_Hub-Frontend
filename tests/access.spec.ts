import { test, expect } from "./fixtures";

test("Arabic RTL access form validates empty and rejected codes", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const input = page.locator("#access-code");
  await page.getByRole("button", { name: "الدخول إلى البوث" }).click();
  await expect(page.locator("#access-error")).toContainText("أدخل رمز الوصول أولًا");
  await expect(input).toBeFocused();
  await input.fill("wrong-code");
  await input.press("Enter");
  await expect(page.getByRole("button", { name: "جارٍ التحقق من الرمز…" })).toBeDisabled();
  await expect(input).toBeDisabled();
  await expect(page.locator("#access-error")).toContainText("غير صحيح");
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute("aria-invalid", "true");
  expect(errors).toEqual([]);
});

test("connection failure stays on access screen and retry can recover", async ({ page }) => {
  await page.goto("/");
  await page.locator("#access-code").fill("offline");
  await page.getByRole("button", { name: "الدخول إلى البوث" }).click();
  await expect(page.locator("#access-error")).toContainText("تعذّر الاتصال");
  await page.getByRole("button", { name: "إعادة محاولة التحقق" }).click();
  await expect(page.locator("#access-error")).toContainText("تعذّر الاتصال");
  await expect(page.getByRole("heading", { name: "تم التحقق بنجاح" })).toHaveCount(0);
  await page.locator("#access-code").fill("demo");
  await page.getByRole("button", { name: "الدخول إلى البوث" }).click();
  await expect(page.getByRole("heading", { name: "تم التحقق بنجاح" })).toBeVisible();
});

test("success clears code, supports visibility and resets without persisting access", async ({ page }) => {
  await page.goto("/");
  const input = page.locator("#access-code");
  await input.fill("demo");
  await expect(input).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "إظهار رمز الوصول" }).click();
  await expect(input).toHaveAttribute("type", "text");
  await input.press("Enter");
  await expect(page.getByRole("heading", { name: "تم التحقق بنجاح" })).toBeFocused();
  await expect(input).toHaveCount(0);
  await page.screenshot({ path: "tmp/qa/success.png", fullPage: true, caret: "initial" });
  await page.getByRole("button", { name: "العودة لشاشة الوصول" }).click();
  await expect(input).toHaveValue("");
  await expect(input).toHaveAttribute("type", "password");
  await expect(input).toBeFocused();
  await page.reload();
  await expect(input).toBeVisible();
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
});

test("desktop and mobile fit the viewport with visible controls", async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole("button", { name: "الدخول إلى البوث" })).toBeVisible();
    await page.screenshot({ path: `tmp/qa/access-${viewport.width}.png`, fullPage: true, caret: "initial" });
  }
});
