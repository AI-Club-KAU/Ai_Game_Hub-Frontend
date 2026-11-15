
import { test, expect, type Page } from "./fixtures";
async function openBooth(page:Page) {
 await page.goto("/"); await page.locator("#access-code").fill("demo");
 await page.getByRole("button",{name:"الدخول إلى البوث"}).click();
 await page.getByRole("button",{name:"تجهيز البوث",exact:true}).click();
}
test("leaderboard handles empty, sample ties, failures, stale responses and private form reset",async({page})=>{
 await openBooth(page);
 await page.locator("#participant-name").fill("اسم غير محفوظ");
 await page.locator("#participant-id").fill("009999");
 await page.getByRole("button",{name:"لوحة المتصدرين",exact:true}).click();
 await expect(page.getByText("جارٍ تحميل المتصدرين…")).toBeVisible();
 await expect(page.getByRole("heading",{name:"البداية أمامكم"})).toBeVisible();
 await page.getByText("إعدادات عرض المتصدرين التجريبية",{exact:true}).click();
 await page.getByLabel("مصدر عرض المتصدرين").selectOption("sample");
 await expect(page.locator(".leaderboard-row")).toHaveCount(3);
 await expect(page.locator(".leaderboard-rank")).toHaveText(["1","2","2"]);
 await expect(page.locator(".leaderboard-points strong")).toHaveText(["280","240","240"]);
 await page.screenshot({path:"tmp/qa/leaderboard-desktop.png",fullPage:true,caret:"initial"});
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:"tmp/qa/leaderboard-mobile.png",fullPage:true,caret:"initial"});
 await page.getByLabel("مصدر عرض المتصدرين").selectOption("offline");
 await expect(page.locator(".leaderboard-row")).toHaveCount(0);
 await expect(page.getByRole("heading",{name:"تعذّر تحميل المتصدرين"})).toBeVisible();
 await page.getByRole("button",{name:"إعادة المحاولة",exact:true}).click();
 await expect(page.getByRole("heading",{name:"تعذّر تحميل المتصدرين"})).toBeVisible();
 await page.getByLabel("مصدر عرض المتصدرين").selectOption("sample");
 await page.getByLabel("مصدر عرض المتصدرين").selectOption("empty");
 await expect(page.getByRole("heading",{name:"البداية أمامكم"})).toBeVisible();
 await expect(page.locator(".leaderboard-row")).toHaveCount(0);
 await page.getByRole("button",{name:"العودة إلى البوث"}).click();
 await expect(page.locator("#participant-name")).toHaveValue("");
 await expect(page.locator("#participant-id")).toHaveValue("");
});
test("confirmed saved score appears in leaderboard without exposing participant identifier",async({page})=>{
 await page.clock.install();
 await openBooth(page);
 await page.getByRole("button",{name:"مشارك سابق",exact:true}).click();
 await page.locator("#participant-id").fill("00123");
 await page.getByRole("button",{name:"استرجاع المشارك",exact:true}).click();
 await page.getByRole("radio",{name:/لعبة تجريبية 03/}).check();
 await page.getByRole("button",{name:"تأكيد اختيار اللعبة"}).click();
 await page.getByRole("button",{name:"ابدأ اللعب",exact:true}).click();
 await expect(page.locator(".game-mode-footer")).toContainText("الحاوية جاهزة");
 await page.getByText("اختبار انتهاء المحاولة وحفظ النتيجة",{exact:true}).click();
 await page.getByRole("button",{name:"إنهاء تجريبي بنتيجة 80"}).click();
 await expect(page.getByRole("heading",{name:"تم تأكيد حفظ النتيجة"})).toBeVisible();
 await page.clock.fastForward(10050);
 await expect(page.locator(".participant-details dd").last()).toHaveText("00123");
 await page.getByRole("button",{name:"تجهيز مشارك آخر",exact:true}).click();
 await page.getByRole("button",{name:"لوحة المتصدرين",exact:true}).click();
 await expect(page.locator(".leaderboard-row")).toHaveCount(1);
 await expect(page.locator(".leaderboard-name h2")).toHaveText("مشارك تجريبي");
 await expect(page.locator(".leaderboard-points strong")).toHaveText("80");
 await expect(page.locator("main")).not.toContainText("00123");
});
