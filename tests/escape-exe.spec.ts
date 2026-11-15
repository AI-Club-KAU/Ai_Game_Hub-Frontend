import { test, expect, type Page } from "./fixtures";
import { canLaunchGame, getGameAsset } from "../src/features/games/game-assets";
import { mockAttemptService, attemptDemo } from "../src/services/mock-attempt-service";
import { eligibilityDemo } from "../src/services/mock-eligibility-service";
import { activeAttempts } from "../src/services/mock-attempt-store";

async function prepare(page: Page, waitForLoad = true) {
  await page.goto("/");
  await page.locator("#access-code").fill("demo");
  await page.getByRole("button", { name: "الدخول إلى البوث" }).click();
  await page.getByRole("button", { name: "تجهيز البوث", exact: true }).click();
  await page.getByRole("button", { name: "مشارك سابق", exact: true }).click();
  await page.locator("#participant-id").fill("00123");
  await page.getByRole("button", { name: "استرجاع المشارك", exact: true }).click();
  await page.getByText("إعدادات العرض التجريبي", { exact: true }).click();
  await page.getByLabel("سجل تجريبي", { exact: true }).selectOption("mock");
  await page.getByRole("radio", { name: /ESCAPE.EXE/ }).check();
  await page.getByRole("button", { name: "تأكيد اختيار اللعبة" }).click();
  await page.getByRole("button", { name: "ابدأ اللعب", exact: true }).click();
  if (waitForLoad) await expect(page.locator(".game-mode-footer")).toContainText("تم تحميل صفحة اللعبة");
}

test("asset registry separates approved Live ESCAPE from the unchanged Mock catalog", () => {
  expect(getGameAsset("mock", true)).toEqual({ game: "escape-exe", entry: "/games/escape-exe/index.html", readiness: "load" });
  expect(getGameAsset("1", false)).toEqual(getGameAsset("mock", true));
  expect(canLaunchGame("1", false)).toBe(true);
  expect(getGameAsset("2", true)?.game).toBe("qa");
  expect(getGameAsset("2", false)?.game).toBe("dev-run");
  for (const id of ["mock", "3", "4", "5"]) {
    expect(canLaunchGame(id, true)).toBe(true);
    expect(canLaunchGame(id, false)).toBe(false);
    expect(getGameAsset(id, false)).toBeNull();
  }
  expect(getGameAsset("unknown", true)).toBeNull();
  expect(getGameAsset("1", true)).toBeNull();
  expect(canLaunchGame("1", true)).toBe(false);
  for (const id of ["unknown", "01", "1.0", "1 ", "0", "6", ""]) {
    expect(canLaunchGame(id, true)).toBe(false);
    expect(canLaunchGame(id, false)).toBe(false);
  }
});

test("mock scenario restores the exact unfinished attempt without another Start", async () => {
  eligibilityDemo.configure({ day: 3, section: "students", history: "mock", offline: false });
  attemptDemo.setMode("normal");
  const identifier = "escape-resume-unit";
  try {
    const started = await mockAttemptService.start({ requestId: crypto.randomUUID(), participantIdentifier: identifier, gameId: "mock", day: 3, section: "students" });
    expect(started.status).toBe("started");
    if (started.status !== "started") throw new Error("Start failed");
    expect(await mockAttemptService.listActive!(identifier)).toEqual([started.attempt]);
    expect(await mockAttemptService.inspect(identifier)).toEqual(started.attempt);
    expect([...activeAttempts.values()].filter(a => a.participantIdentifier === identifier)).toHaveLength(1);
    activeAttempts.delete(started.attempt.id);
  } finally { eligibilityDemo.reset(); }
});

test("ESCAPE loads without QA readiness and resume creates a fresh 180-second round", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await prepare(page);
  const iframe = page.locator("iframe");
  const firstSource = await iframe.getAttribute("src");
  await expect(iframe).toHaveAttribute("src", /\/games\/escape-exe\/index.html\?nonce=/);
  await expect(iframe).toHaveAttribute("sandbox", "allow-scripts");
  await expect(iframe).toHaveAttribute("referrerpolicy", "no-referrer");
  await expect(iframe).toHaveAttribute("allow", "camera 'none'; microphone 'none'; geolocation 'none'");
  await expect(page.locator(".result-demo")).toHaveCount(0);
  const game = page.frameLocator("iframe");
  await game.locator("#startButton").click();
  await expect(game.locator("#gameScreen")).toBeVisible();
  await expect(game.locator("#timer")).not.toHaveText("03:00", { timeout: 5000 });
  await page.getByRole("button", { name: "طلب مساعدة" }).click();
  await page.getByRole("button", { name: "العودة إلى شاشة الموظف" }).click();
  await expect(page.getByRole("radio", { name: /ESCAPE.EXE/ })).toBeDisabled();
  await page.getByRole("button", { name: "استئناف المحاولة", exact: true }).click();
  await expect(page.locator(".game-mode-footer")).toContainText("تم تحميل صفحة اللعبة");
  expect(await iframe.getAttribute("src")).not.toBe(firstSource);
  await expect(game.locator("#startScreen")).toBeVisible();
  await expect(game.locator("#timer")).toHaveText("03:00");
  await expect(game.locator("#score")).toHaveText("0");
  await game.locator("#startButton").click();
  await expect(game.locator("#gameScreen")).toBeVisible();
  expect(errors).toEqual([]);
});

test("missing ESCAPE HTML retries the same container without enabling QA finish", async ({ page }) => {
  await page.route("**/games/escape-exe/index.html*", route => route.fulfill({ status: 404, contentType: "text/html", body: "missing" }));
  await prepare(page, false);
  await expect(page.getByRole("heading", { name: "تعذّر تحميل صفحة اللعبة" })).toBeVisible();
  await page.unroute("**/games/escape-exe/index.html*");
  await page.getByRole("button", { name: "إعادة تحميل الحاوية" }).click();
  await expect(page.locator(".game-mode-footer")).toContainText("تم تحميل صفحة اللعبة");
  await expect(page.frameLocator("iframe").locator("#startButton")).toBeVisible();
  await expect(page.locator(".result-demo")).toHaveCount(0);
});
