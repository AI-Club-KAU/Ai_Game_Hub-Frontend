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

async function finish(page: Page, mode = "normal") {
  await prepare(page);
  await page.getByRole("button", { name: "ابدأ اللعب", exact: true }).click();
  await expect(page.locator(".game-mode-footer")).toContainText("الحاوية جاهزة");
  await page.getByText("اختبار انتهاء المحاولة وحفظ النتيجة", { exact: true }).click();
  await page.getByLabel("استجابة خدمة الحفظ").selectOption(mode);
  await page.getByRole("button", { name: "إنهاء تجريبي بنتيجة 80" }).click();
}
test("confirmed result stays ten seconds then clears participant; saved score blocks replay", async ({page}) => {
  await page.clock.install();
  await finish(page);
  await expect(page.getByRole("heading", {name:"تم تأكيد حفظ النتيجة"})).toBeVisible();
  await page.screenshot({path:"tmp/qa/result-desktop.png",caret:"initial"});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:"tmp/qa/result-mobile.png",caret:"initial"});
  await page.clock.fastForward(9000);
  await expect(page.locator(".result-card")).toBeVisible();
  await page.clock.fastForward(1100);
  await expect(page.locator("#participant-name")).toHaveValue("");
  await expect(page.locator("#participant-id")).toHaveValue("");
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.getByRole("button", {name:"مشارك سابق",exact:true}).click();
  await page.locator("#participant-id").fill("00123");
  await page.getByRole("button",{name:"استرجاع المشارك",exact:true}).click();
  await expect(page.locator(".eligibility-status")).toContainText("اكتملت مشاركة اليوم");
  await expect(page.getByRole("button",{name:"استئناف المحاولة"})).toHaveCount(0);
});
test("lost save response never starts countdown; inspection confirms the saved result", async ({page}) => {
  await page.clock.install();
  await finish(page,"lost-response");
  await expect(page.locator(".result-card").getByRole("alert")).toContainText("تعذّر تأكيد");
  await page.clock.fastForward(15000);
  await expect(page.getByRole("heading",{name:"بانتظار تأكيد الحفظ"})).toBeVisible();
  await page.getByRole("button",{name:"التحقق من حالة الحفظ"}).click();
  await expect(page.getByRole("heading",{name:"تم تأكيد حفظ النتيجة"})).toBeVisible();
});
test("offline save and inspection remain unresolved, retry saves the same attempt", async ({page}) => {
  await finish(page,"offline");
  await expect(page.locator(".result-card").getByRole("alert")).toContainText("تعذّر تأكيد");
  await page.getByRole("button",{name:"التحقق من حالة الحفظ"}).click();
  await expect(page.locator(".result-card").getByRole("alert")).toContainText("تعذّر تأكيد");
  await page.getByText("محاكاة خدمة حفظ النتيجة",{exact:true}).click();
  await page.getByLabel("استجابة خدمة الحفظ").selectOption("normal");
  await page.getByRole("button",{name:"التحقق من حالة الحفظ"}).click();
  await expect(page.locator(".result-card").getByRole("alert")).toContainText("لم تُحفظ النتيجة");
  await page.getByRole("button",{name:"إعادة محاولة الحفظ"}).click();
  await expect(page.getByRole("heading",{name:"تم تأكيد حفظ النتيجة"})).toBeVisible();
});

test("rejected result stays pending and can recover without a new game",async({page})=>{
 await finish(page,"rejected");
 await expect(page.locator(".result-card").getByRole("alert")).toContainText("لم تعتمد الخدمة");
 await expect(page.locator(".result-score")).toHaveCount(0);
 await page.getByText("محاكاة خدمة حفظ النتيجة",{exact:true}).click();
 await page.getByLabel("استجابة خدمة الحفظ").selectOption("normal");
 await page.getByRole("button",{name:"إعادة محاولة الحفظ"}).click();
 await expect(page.getByRole("heading",{name:"تم تأكيد حفظ النتيجة"})).toBeVisible();
});
