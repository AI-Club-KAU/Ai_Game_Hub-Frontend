import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { escapeExeScore } from "../src/features/games/escape-exe-result";

function packet(score = 0, nonce = "run") {
  const correct = score / 10;
  return { type: "robomaze:result", nonce, payload: { game: "escape-exe", finalScore: score, maxScore: 100,
    correctAnswers: correct, questionsAnswered: 10, escaped: false, timeRemaining: 0, durationSeconds: 180,
    answers: Array.from({ length: 10 }, (_, i) => ({ checkpoint: i + 1, system: "Question " + i, result: i < correct ? "correct" : "wrong" })) } };
}

test("result schema accepts 0 and 100 and rejects inconsistent, malformed and stale data", () => {
  expect(escapeExeScore(packet(0), "run")).toBe(0);
  expect(escapeExeScore(packet(100), "run")).toBe(100);
  const good = packet(100);
  const bad = [null, [], {}, { ...good, type: "robomaze" }, { ...good, nonce: "old" },
    ...[{ finalScore: "100" }, { finalScore: 1.5 }, { finalScore: -1 }, { finalScore: 101 }, { maxScore: 500 },
      { game: "other" }, { correctAnswers: 9 }, { questionsAnswered: 11 }, { answers: [] },
      { escaped: "true" }, { durationSeconds: 181 }, { timeRemaining: 50 },
      { answers: good.payload.answers.map((a, i) => i ? a : { ...a, result: "invalid" }) },
      { answers: good.payload.answers.map((a, i) => i ? a : { ...a, checkpoint: 2 }) },
      { questionsAnswered: 9 }, { answers: good.payload.answers.map((a, i) => i ? a : { ...a, result: "wrong" }) }]
      .map(patch => ({ ...good, payload: { ...good.payload, ...patch } }))];
  for (const value of bad) expect(escapeExeScore(value, "run")).toBeNull();
});

async function launch(page: Page) {
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
  await expect(page.locator(".game-mode-footer")).toContainText("تم تحميل صفحة اللعبة");
  return page.frames().find(f => f.url().includes("/games/escape-exe/"))!;
}

async function send(page: Page, score: number, duplicates = false) {
  const frame = page.frames().find(f => f.url().includes("/games/escape-exe/"))!;
  await frame.evaluate(({ data, duplicates }) => {
    data.nonce = new URLSearchParams(location.search).get("nonce")!;
    parent.postMessage(data, "*");
    if (duplicates) { parent.postMessage(data, "*"); parent.postMessage({ ...data, payload: { ...data.payload, finalScore: 50 } }, "*"); }
  }, { data: packet(score), duplicates });
}

test("first result owns the platform attempt, saves 100 once, and returns only after ten confirmed seconds", async ({ page }) => {
  await page.clock.install();
  await launch(page);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await send(page, 100, true);
  await expect(page.locator(".result-embedded")).toContainText("جارٍ التحقق من حفظ النتيجة");
  await expect(page.locator("iframe")).toBeVisible();
  await page.clock.runFor(700);
  await expect(page.locator(".result-embedded")).toContainText("تم تأكيد حفظ النتيجة");
  await expect(page.locator(".result-embedded .result-score b")).toHaveText("100");
  await page.clock.runFor(9999);
  await expect(page.locator("iframe")).toHaveCount(1);
  await page.clock.runFor(1);
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.clock.resume();
  await expect(page.locator(".participant-details dd")).toHaveText(["مشارك تجريبي", "00123"]);
  await expect(page.getByLabel("سجل تجريبي", { exact: true })).toHaveValue("mock");
  await expect(page.locator("#participant-name")).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /ESCAPE.EXE/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: "استئناف المحاولة" })).toHaveCount(0);
  await expect(page.locator(".previous-results li")).toHaveCount(1);
  await expect(page.locator(".previous-results")).toContainText("100 / 100");
  await expect(page.locator(".progress-stats strong").first()).toHaveText("100 / 500");
  await page.getByRole("button", { name: "تجهيز مشارك آخر" }).click();
  await expect(page.locator("#participant-name")).toHaveValue("");
  await expect(page.locator("#participant-id")).toHaveValue("");
});

test("unrelated windows, wrong origin and old iframe/nonce cannot finish the current attempt", async ({ page }) => {
  const old = await launch(page);
  const oldWindow = await page.evaluateHandle(() => document.querySelector("iframe")!.contentWindow);
  const oldNonce = new URL(old.url()).searchParams.get("nonce")!;
  await page.getByRole("button", { name: "طلب مساعدة" }).click();
  await page.getByRole("button", { name: "العودة إلى شاشة الموظف" }).click();
  await page.getByRole("button", { name: "استئناف المحاولة" }).click();
  await expect(page.locator(".game-mode-footer")).toContainText("تم تحميل صفحة اللعبة");
  const current = page.frames().find(f => f.url().includes("/games/escape-exe/"))!;
  const nonce = new URL(current.url()).searchParams.get("nonce")!;
  await page.evaluate(({ data, oldWindow }) => {
    window.postMessage(data, "*");
    window.dispatchEvent(new MessageEvent("message", { data, origin: "null", source: oldWindow }));
    window.dispatchEvent(new MessageEvent("message", { data, origin: location.origin, source: document.querySelector("iframe")!.contentWindow }));
  }, { data: packet(100, nonce), oldWindow });
  await current.evaluate(data => parent.postMessage(data, "*"), packet(100, oldNonce));
  await current.evaluate(data => parent.postMessage(data, "*"), { ...packet(100, nonce), payload: { ...packet(100).payload, maxScore: 200 } });
  await page.waitForTimeout(900);
  await expect(page.locator(".result-embedded")).toHaveCount(0);
  await send(page, 0);
  await expect(page.locator(".result-embedded .result-score b")).toHaveText("0");
});

for (const mode of ["offline", "rejected", "lost-response"] as const) {
  test(`${mode} result remains locked and uncertain until retry or inspection confirms it`, async ({ page }) => {
    await page.clock.install();
    await launch(page);
    await page.getByLabel("استجابة خدمة الحفظ قبل النهاية").selectOption(mode);
    await send(page, 100, true);
    await expect(page.locator(".result-embedded [role=alert]")).toBeVisible();
    await page.clock.fastForward(15000);
    await expect(page.locator("iframe")).toBeVisible();
    await expect(page.locator(".result-embedded")).not.toContainText("العودة إلى اختيار ألعابك خلال");
    await expect(page.getByRole("button", { name: "طلب مساعدة" })).toBeDisabled();
    await page.getByText("محاكاة خدمة حفظ النتيجة", { exact: true }).click();
    await page.getByLabel("استجابة خدمة الحفظ", { exact: true }).selectOption("normal");
    await page.getByRole("button", { name: mode === "lost-response" ? "التحقق من حالة الحفظ" : "إعادة محاولة الحفظ", exact: true }).click();
    await expect(page.locator(".result-embedded .result-score b")).toHaveText("100");
  });
}

for (const touch of [false, true]) test(`real timeout preserves animations and blocks replay with touch=${touch}`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1200, height: 1000 }, hasTouch: touch });
  const page = await context.newPage();
  try {
    const frame = await launch(page);
    await frame.locator("#startButton").click();
    await frame.evaluate(() => { const original = requestAnimationFrame.bind(window); let extra = 0; window.requestAnimationFrame = cb => original(t => { extra += 250; cb(t + extra); }); });
    await expect(page.locator(".result-embedded .result-score b")).toHaveText("0", { timeout: 30000 });
    await expect(frame.locator("#resultScreen")).toBeVisible();
    await page.waitForTimeout(1300);
    const box = await frame.locator("#restartButton").boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    if (touch) await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.keyboard.press("Enter"); await page.keyboard.press("Tab"); await page.keyboard.press("Enter");
    const result = await frame.evaluate(() => {
      const game = (window as unknown as { RoboMaze: { start(): void; getState(): { running: boolean } } }).RoboMaze;
      document.querySelector<HTMLButtonElement>("#restartButton")!.focus(); game.start();
      document.querySelector<HTMLButtonElement>("#restartButton")!.click();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      return { running: game.getState().running, inert: document.body.inert, focus: document.activeElement?.id,
        animations: document.getAnimations().filter(a => a.playState === "running").length };
    });
    expect(result.running).toBe(false); expect(result.inert).toBe(true);
    expect(result.focus).not.toBe("restartButton"); expect(result.animations).toBeGreaterThan(0);
    await page.screenshot({ path: "tmp/qa/escape-ending.png", fullPage: true });
  } finally { await context.close(); }
});

test("real perfect run saves 100 with the original question bank and score animation", async ({ page }) => {
  const source = readFileSync("public/games/escape-exe/script.js", "utf8");
  const bank = JSON.parse(source.match(/const QUESTION_BANK = (\{[\s\S]*?\n\});/)![1]) as Record<string, { prompt: string; options: string[]; answer: number }[]>;
  const answers = new Map(Object.values(bank).flat().map(q => [q.prompt, q.options[q.answer]]));
  const map = JSON.parse("[" + source.match(/const MAP = \[([\s\S]*?)\];/)![1] + "]") as string[];
  const frame = await launch(page);
  await frame.locator("#startButton").click();
  let at = { x: 1, y: 1 };
  const directions = [[1, 0, "ArrowRight"], [-1, 0, "ArrowLeft"], [0, 1, "ArrowDown"], [0, -1, "ArrowUp"]] as const;
  for (let checkpoint = 0; checkpoint <= 10; checkpoint++) {
    const target = checkpoint === 10 ? "E" : String(checkpoint);
    const queue = [{ ...at, keys: [] as string[] }], seen = new Set([`${at.x},${at.y}`]);
    let path: string[] = [];
    while (queue.length) {
      const p = queue.shift()!;
      if (map[p.y][p.x] === target) { path = p.keys; break; }
      for (const [dx, dy, key] of directions) {
        const x = p.x + dx, y = p.y + dy, cell = map[y]?.[x];
        if (!cell || cell === "#" || seen.has(`${x},${y}`) || (/\d/.test(cell) && Number(cell) > checkpoint)) continue;
        seen.add(`${x},${y}`); queue.push({ x, y, keys: [...p.keys, key] });
      }
    }
    for (const key of path) await page.keyboard.press(key);
    if (checkpoint < 10) {
      await expect(frame.locator("#challengeModal")).toBeVisible();
      const answer = answers.get((await frame.locator("#challengeQuestion").textContent())!);
      await frame.locator(".answer-option").filter({ hasText: answer! }).click();
      await frame.locator("#submitAnswer").click(); await frame.locator("#submitAnswer").click();
      await page.keyboard.press(path[path.length - 1]);
    }
    const y = map.findIndex(row => row.includes(target)); at = { x: map[y].indexOf(target), y };
  }
  await expect(page.locator(".result-embedded .result-score b")).toHaveText("100");
  await expect(frame.locator("#finalScore")).toHaveText("100");
  await expect(frame.locator("#resultScreen")).toHaveAttribute("data-tier", "perfect");
});

test("standalone query parameters cannot opt in, and normal PLAY AGAIN still works", async ({ page }) => {
  await page.goto("/games/escape-exe/index.html?nonce=12345678-1234-1234-1234-123456789abc&platform=true");
  await page.locator("#startButton").click();
  await page.evaluate(() => { const original = requestAnimationFrame.bind(window); let extra = 0; window.requestAnimationFrame = cb => original(t => { extra += 250; cb(t + extra); }); });
  await expect(page.locator("#resultScreen")).toBeVisible({ timeout: 30000 });
  await page.locator("#restartButton:not(.arming)").click();
  await expect(page.locator("#gameScreen")).toBeVisible();
  expect(await page.evaluate(() => document.body.inert)).toBe(false);
});
