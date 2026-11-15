import { test, expect, type Page } from "@playwright/test";
async function prepare(page: Page, customContext = false) {
  await page.goto("/");
  await page.locator("#access-code").fill("demo");
  await page.getByRole("button", { name: "الدخول إلى البوث" }).click();
  await page.getByRole("button", { name: "تجهيز البوث", exact: true }).click();
  await page.getByRole("button", { name: "مشارك سابق", exact: true }).click();
  await page.locator("#participant-id").fill("00123");
  await page.getByRole("button", { name: "استرجاع المشارك", exact: true }).click();
  if (customContext) {
    await page.getByText("إعدادات العرض التجريبي", { exact: true }).click();
    await page.getByLabel("يوم التجربة", { exact: true }).selectOption("4");
    await page.getByLabel("قسم التجربة", { exact: true }).selectOption("female-students");
  }
  await page.getByRole("radio", { name: /لعبة تجريبية 03/ }).check();
  await page.getByRole("button", { name: "تأكيد اختيار اللعبة" }).click();
  await expect(page.getByRole("button", { name: "ابدأ اللعب", exact: true })).toBeEnabled();
}

async function finish(page: Page, mode = "normal", customContext = false) {
  await prepare(page, customContext);
  await page.getByRole("button", { name: "ابدأ اللعب", exact: true }).click();
  await expect(page.locator(".game-mode-footer")).toContainText("الحاوية جاهزة");
  await page.getByText("اختبار انتهاء المحاولة وحفظ النتيجة", { exact: true }).click();
  await page.getByLabel("استجابة خدمة الحفظ").selectOption(mode);
  await page.getByRole("button", { name: "إنهاء تجريبي بنتيجة 80" }).click();
}
test("confirmed result returns to the same participant, refreshes progress and preserves demo context", async ({page}) => {
  await page.clock.install();
  await finish(page, "normal", true);
  await expect(page.getByRole("heading", {name:"تم تأكيد حفظ النتيجة"})).toBeVisible();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  await page.screenshot({path:"tmp/qa/result-desktop.png",caret:"initial"});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:"tmp/qa/result-mobile.png",caret:"initial"});
  await page.clock.fastForward(9000);
  await expect(page.locator(".result-card")).toBeVisible();
  await page.clock.fastForward(1100);
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.clock.resume();
  await expect(page.locator(".participant-details dd")).toHaveText(["مشارك تجريبي", "00123"]);
  await expect(page.locator("#participant-name")).toHaveCount(0);
  await expect(page.locator(".previous-results li")).toHaveCount(1);
  await expect(page.locator(".previous-results")).toContainText("80 / 100");
  await expect(page.locator(".progress-stats strong").first()).toHaveText("80 / 500");
  await expect(page.locator(".progress-stats strong").last()).toHaveText("1 / 5");
  await expect(page.getByLabel("يوم التجربة", { exact: true })).toHaveValue("4");
  await expect(page.getByLabel("قسم التجربة", { exact: true })).toHaveValue("female-students");
  await expect(page.locator('input[name="eligible-game"]:checked')).toHaveCount(0);
  await expect(page.locator(".selection-confirmed")).toHaveCount(0);
  await expect(page.getByRole("radio",{name:/لعبة تجريبية 03/})).toBeDisabled();
  await expect(page.locator('input[name="eligible-game"]:enabled')).toHaveCount(4);
  await expect(page.getByRole("button",{name:"استئناف المحاولة"})).toHaveCount(0);
  await page.getByRole("radio", { name: /لعبة تجريبية 04/ }).check();
  await page.getByRole("button", { name: "تأكيد اختيار اللعبة" }).click();
  await expect(page.getByRole("button", { name: "ابدأ اللعب", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "استئناف المحاولة" })).toHaveCount(0);
  await page.getByRole("button", { name: "ابدأ اللعب", exact: true }).click();
  await expect(page.locator(".game-mode-header h1")).toHaveText("لعبة تجريبية 04");
  await page.getByRole("button", { name: "طلب مساعدة" }).click();
  await page.getByRole("button", { name: "العودة إلى شاشة الموظف" }).click();
  await expect(page.locator(".participant-details dd")).toHaveText(["مشارك تجريبي", "00123"]);
  await page.getByRole("button", { name: "تجهيز مشارك آخر" }).click();
  await expect(page.locator("#participant-name")).toHaveValue("");
  await expect(page.locator("#participant-id")).toHaveValue("");
  await expect(page.locator(".participant-details")).toHaveCount(0);
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
