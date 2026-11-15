import { test, expect, type Page } from "@playwright/test";
import { registerResultUnloadWarning } from "../src/features/games/result-unload-warning";

test("warning cleanup removes the exact listener, including repeated mount/unmount cycles", () => {
  const target = new EventTarget();
  const probe = () => {
    const event = new Event("beforeunload", { cancelable: true });
    // Node's generic Event has no writable BeforeUnloadEvent.returnValue.
    Object.defineProperty(event, "returnValue", { value: "", writable: true });
    return target.dispatchEvent(event);
  };
  expect(probe()).toBe(true);
  for (let cycle = 0; cycle < 3; cycle++) {
    const cleanup = registerResultUnloadWarning(target);
    expect(probe()).toBe(false);
    cleanup();
    expect(probe()).toBe(true);
  }
});

async function openGame(page: Page) {
  await page.goto("/");
  await page.locator("#access-code").fill("demo");
  await page.getByRole("button", { name: "الدخول إلى البوث" }).click();
  await page.getByRole("button", { name: "تجهيز البوث", exact: true }).click();
  await page.getByRole("button", { name: "مشارك سابق", exact: true }).click();
  await page.locator("#participant-id").fill("00123");
  await page.getByRole("button", { name: "استرجاع المشارك", exact: true }).click();
  await page.getByRole("radio", { name: /لعبة تجريبية 03/ }).check();
  await page.getByRole("button", { name: "تأكيد اختيار اللعبة" }).click();
  await page.getByRole("button", { name: "ابدأ اللعب", exact: true }).click();
  await expect(page.locator(".game-mode-footer")).toContainText("الحاوية جاهزة");
  await page.getByText("اختبار انتهاء المحاولة وحفظ النتيجة", { exact: true }).click();
  await page.getByLabel("استجابة خدمة الحفظ").selectOption("offline");
}

const warns = (page: Page) => page.evaluate(() => {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
});

test("warning spans initial save, uncertainty, checking and retry; confirmation removes it before countdown", async ({ page }) => {
  test.setTimeout(60000);
  await page.clock.install();
  await openGame(page);
  expect(await warns(page)).toBe(false); // An unfinished game has no accepted result.
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  await page.getByRole("button", { name: "إنهاء تجريبي بنتيجة 80" }).click();
  await expect(page.getByRole("heading", { name: "جارٍ حفظ النتيجة…" })).toBeVisible();
  expect(await warns(page)).toBe(true);
  await expect(page.getByRole("button", { name: "إعادة محاولة الحفظ", exact: true })).toBeDisabled();
  await page.clock.runFor(700);
  await expect(page.locator(".result-card").getByRole("alert")).toContainText("قد تكون النتيجة حُفظت");
  expect(await warns(page)).toBe(true);
  await page.clock.runFor(15000);
  await expect(page.locator(".result-card")).not.toContainText("العودة إلى اختيار ألعابك خلال");

  await page.getByText("محاكاة خدمة حفظ النتيجة", { exact: true }).click();
  await page.getByLabel("استجابة خدمة الحفظ", { exact: true }).selectOption("normal");
  await page.getByRole("button", { name: "التحقق من حالة الحفظ", exact: true }).click();
  await expect(page.getByRole("heading", { name: "جارٍ التحقق من حالة الحفظ…" })).toBeVisible();
  expect(await warns(page)).toBe(true);
  await page.clock.runFor(700);
  await expect(page.locator(".result-card").getByRole("alert")).toContainText("لم يظهر تأكيد للحفظ في آخر تحقق");
  expect(await warns(page)).toBe(true);

  await page.getByRole("button", { name: "إعادة محاولة الحفظ", exact: true }).click();
  await expect(page.getByRole("heading", { name: "جارٍ إعادة محاولة الحفظ…" })).toBeVisible();
  expect(await warns(page)).toBe(true);
  await page.clock.runFor(700);
  await expect(page.getByRole("heading", { name: "تم تأكيد حفظ النتيجة" })).toBeVisible();
  expect(await warns(page)).toBe(false);
  await page.clock.runFor(9999);
  await expect(page.locator(".result-card")).toBeVisible();
  await page.clock.runFor(1);
  await expect(page.locator(".result-card")).toHaveCount(0);
  await page.clock.resume();
  await expect(page.locator(".participant-details dd").last()).toHaveText("00123");
  expect(await warns(page)).toBe(false); // ResultScreen has also unmounted.
});

test("native beforeunload dialog can cancel a reload while saving is uncertain", async ({ page }) => {
  await openGame(page);
  await page.getByRole("button", { name: "إنهاء تجريبي بنتيجة 80" }).click();
  await expect(page.locator(".result-card").getByRole("alert")).toContainText("قد تكون النتيجة حُفظت");
  const dialogPromise = page.waitForEvent("dialog");
  // Chromium may leave reload waiting after cancellation; bound that test operation.
  const reload = page.reload({ timeout: 5000, waitUntil: "commit" }).catch(() => null);
  const dialog = await dialogPromise;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.dismiss();
  await expect(page.getByRole("heading", { name: "بانتظار تأكيد الحفظ" })).toBeVisible();
  expect(await warns(page)).toBe(true);
  await reload;
});
