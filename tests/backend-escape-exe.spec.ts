import { TEST_API_BASE_URL } from "./test-environment";
import { test, expect, type Page, type Frame } from "./fixtures";
import { canLaunchGame, getGameAsset } from "../src/features/games/game-assets";

const apiUrl = TEST_API_BASE_URL;
const studentId = "00000000-0000-0000-0000-000000000001";
const attemptId = "10000000-0000-0000-0000-000000000001";
type Attempt = { id: string; student_id: string; game_id: number; status: "started" | "completed"; score: number | null; play_date: string; started_at: string };
type FinishMode = "normal" | "pending" | "offline" | "lost" | "id" | "student_id" | "game_id";

async function backend(page: Page, existing = false) {
  const fresh = (): Attempt => ({ id: attemptId, student_id: studentId, game_id: 1, status: "started", score: null, play_date: "2026-11-15", started_at: "2026-11-15T10:00:00Z" });
  let attempt: Attempt | null = existing ? fresh() : null;
  let mode: FinishMode = "normal", loseStart = false;
  let release: (() => void) | undefined;
  const calls: { path: string; body: Record<string, unknown> | null }[] = [];
  await page.route(apiUrl + "/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname.split("/functions/v1")[1];
    const body = request.postDataJSON() as Record<string, unknown> | null;
    const respond = (json: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(json) });
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,OPTIONS" } });
    calls.push({ path, body });
    if (path === "/access/verify") return respond({ access_token: "test-platform-token", token_type: "Bearer", expires_in: 3600 });
    expect(request.headers().authorization).toBe("Bearer test-platform-token");
    if (path === "/students/login") return respond({ student: { id: studentId, student_number: "00123", full_name: "مشارك اختبار Live" } });
    if (path.endsWith("/progress")) return respond({ student_id: studentId, play_date: "2026-11-15", daily_slot_consumed: false,
      total_score: attempt?.status === "completed" ? attempt.score : 0, games_completed: attempt?.status === "completed" ? 1 : 0,
      games: [1, 2, 3, 4, 5].map(id => ({ id, name: id === 1 ? "ESCAPE.EXE" : "Game " + id, max_score: 100, is_active: true,
        attempt: id === 1 ? attempt : null, eligible_to_start: id !== 1 || !attempt })) });
    if (path === "/attempts/start") {
      expect(body).toEqual({ student_id: studentId, game_id: 1 });
      if (attempt) return respond({ error: { code: "game_already_attempted" } }, 409);
      attempt = fresh();
      if (loseStart) return route.abort();
      return respond({ attempt }, 201);
    }
    if (path === "/attempts/finish") {
      expect(body?.attempt_id).toBe(attemptId);
      expect(Object.keys(body!).sort()).toEqual(["attempt_id", "score"]);
      const fault = mode;
      if (fault === "pending") await new Promise<void>(resolve => { release = resolve; });
      if (fault === "offline") return route.abort();
      if (attempt?.status === "completed") return respond({ error: { code: "attempt_already_completed" } }, 409);
      expect(attempt?.status).toBe("started");
      attempt = { ...attempt!, status: "completed", score: body!.score as number };
      if (fault === "lost") return route.abort();
      const returned = ["id", "student_id", "game_id"].includes(fault)
        ? { ...attempt, [fault]: fault === "game_id" ? 2 : "20000000-0000-0000-0000-000000000002" } : attempt;
      return respond({ attempt: returned, score_saved: true, total_available: true, total_score: attempt.score, games_completed: 1 });
    }
    if (path === "/leaderboard") return respond({ leaderboard: attempt?.status === "completed" ? [{ full_name: "مشارك اختبار Live", total_score: attempt.score, games_completed: 1 }] : [] });
    throw new Error("Unexpected API call: " + path);
  });
  return { calls, starts: () => calls.filter(c => c.path === "/attempts/start"), finishes: () => calls.filter(c => c.path === "/attempts/finish"),
    setFinish: (value: FinishMode) => { mode = value; }, loseStart: () => { loseStart = true; }, release: () => { expect(release).toBeDefined(); release!(); }, attempt: () => attempt };
}

async function identify(page: Page) {
  await page.goto("/");
  await page.locator("#access-code").fill("test-operator-code");
  await page.getByRole("button", { name: "الدخول إلى البوث" }).click();
  await page.getByRole("button", { name: "تجهيز البوث", exact: true }).click();
  await page.getByRole("button", { name: "مشارك سابق", exact: true }).click();
  await page.locator("#participant-id").fill("00123");
  await page.getByRole("button", { name: "استرجاع المشارك", exact: true }).click();
  await expect(page.locator('input[name="eligible-game"]')).toHaveCount(5);
}
async function select(page: Page, id = "1") {
  await page.locator(`input[name="eligible-game"][value="${id}"]`).check();
  await page.getByRole("button", { name: "تأكيد اختيار اللعبة" }).click();
}
async function ready(page: Page) {
  await expect(page.locator(".game-mode-footer")).toContainText("تم تحميل صفحة اللعبة");
  return page.frames().find(frame => frame.url().includes("/games/escape-exe/"))!;
}
async function launch(page: Page) {
  await identify(page); await select(page);
  await page.getByRole("button", { name: "ابدأ اللعب", exact: true }).click();
  return ready(page);
}
function packet(score: number, nonce: string) {
  return { type: "robomaze:result", nonce, payload: { game: "escape-exe", finalScore: score, maxScore: 100, correctAnswers: score / 10,
    questionsAnswered: 10, escaped: false, timeRemaining: 0, durationSeconds: 180,
    answers: Array.from({ length: 10 }, (_, i) => ({ checkpoint: i + 1, system: "Question " + i, result: i < score / 10 ? "correct" : "wrong" })) } };
}
const nonceOf = (frame: Frame) => new URL(frame.url()).searchParams.get("nonce")!;
const send = (frame: Frame, data: unknown) => frame.evaluate(value => parent.postMessage(value, "*"), data);
const warns = (page: Page) => page.evaluate(() => !window.dispatchEvent(new Event("beforeunload", { cancelable: true })));

test.describe.configure({ timeout: 60000 });

test("only the official Live ID maps to ESCAPE; mock and QA never become Live assets", () => {
  expect(getGameAsset("1", false)?.game).toBe("escape-exe");
  expect(getGameAsset("1", true)).toBeNull();
  expect(getGameAsset("mock", true)?.game).toBe("escape-exe");
  for (const id of ["mock", "4", "5", "01", "unknown"]) {
    expect(getGameAsset(id, false)).toBeNull(); expect(canLaunchGame(id, false)).toBe(false);
  }
});

test("new Live attempt starts once, opens the real isolated asset and blocks the remaining placeholders", async ({ page }) => {
  const api = await backend(page); await identify(page);
  for (const id of ["4", "5"]) {
    await select(page, id);
    await expect(page.getByRole("button", { name: "ابدأ اللعب", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "تغيير الاختيار", exact: true }).click();
  }
  expect(api.starts()).toHaveLength(0);
  await select(page);
  await expect(page.getByRole("button", { name: "ابدأ اللعب", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "ابدأ اللعب", exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  const frame = await ready(page);
  expect(api.starts()).toHaveLength(1); expect(api.attempt()?.id).toBe(attemptId);
  expect([...new URL(frame.url()).searchParams.keys()]).toEqual(["nonce"]);
  await expect(page.locator("iframe")).toHaveAttribute("sandbox", "allow-scripts");
  await expect(page.locator("iframe")).toHaveAttribute("referrerpolicy", "no-referrer");
  await expect(page.locator("iframe")).toHaveAttribute("allow", "camera 'none'; microphone 'none'; geolocation 'none'");
  await expect(page.locator(".result-demo,.attempt-demo")).toHaveCount(0);
  await expect(frame.locator("#startScreen")).toBeVisible();
  await expect(frame.locator("#timer")).toHaveText("03:00");
});

test("resume and refresh reopen a started Backend attempt from the beginning without Start", async ({ page }) => {
  const api = await backend(page, true); await identify(page);
  await page.getByRole("button", { name: "استئناف المحاولة", exact: true }).click();
  const first = await ready(page), nonce = nonceOf(first);
  await first.locator("#startButton").click();
  await expect(first.locator("#timer")).not.toHaveText("03:00");
  await page.getByRole("button", { name: "طلب مساعدة" }).click();
  await page.getByRole("button", { name: "العودة إلى شاشة الموظف" }).click();
  await page.getByRole("button", { name: "استئناف المحاولة", exact: true }).click();
  const second = await ready(page);
  const secondNonce = nonceOf(second);
  expect(secondNonce).not.toBe(nonce);
  await expect(second.locator("#startScreen")).toBeVisible();
  await expect(second.locator("#timer")).toHaveText("03:00"); await expect(second.locator("#score")).toHaveText("0");
  await page.reload(); await identify(page);
  await page.getByRole("button", { name: "استئناف المحاولة", exact: true }).click();
  const third = await ready(page);
  expect(nonceOf(third)).not.toBe(secondNonce);
  await expect(third.locator("#timer")).toHaveText("03:00");
  await send(third, packet(0, nonceOf(third)));
  await expect(page.locator(".result-score b")).toHaveText("0");
  expect(api.starts()).toHaveLength(0);
  expect(api.finishes().map(c => c.body)).toEqual([{ attempt_id: attemptId, score: 0 }]);
});

test("first valid result saves 100 using Backend attempt ID; countdown starts only after confirmation", async ({ page }) => {
  await page.clock.install();
  const api = await backend(page), frame = await launch(page); api.setFinish("pending");
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  await frame.evaluate(data => { parent.postMessage(data, "*"); parent.postMessage(data, "*"); }, packet(100, nonceOf(frame)));
  await expect.poll(() => api.finishes().length).toBe(1);
  expect(await warns(page)).toBe(true);
  await page.clock.runFor(5000);
  await expect(page.locator(".result-embedded")).not.toContainText("العودة إلى اختيار ألعابك خلال");
  await expect(page.locator("iframe")).toBeVisible(); await expect(page.locator("iframe")).toHaveAttribute("inert", "");
  await send(frame, packet(0, nonceOf(frame))); expect(api.finishes()).toHaveLength(1);
  api.release();
  await expect(page.getByRole("heading", { name: "تم تأكيد حفظ النتيجة" })).toBeVisible();
  expect(await warns(page)).toBe(false);
  expect(api.finishes()[0].body).toEqual({ attempt_id: attemptId, score: 100 });
  await page.clock.runFor(9999); await expect(page.locator("iframe")).toHaveCount(1);
  await page.clock.runFor(1); await expect(page.locator("iframe")).toHaveCount(0);
  await page.clock.resume();
  await expect(page.locator(".participant-details dd").last()).toHaveText("00123");
  await expect(page.locator('input[value="1"][name="eligible-game"]')).toBeDisabled();
  await expect(page.locator(".progress-stats strong").first()).toHaveText("100 / 500");
  await expect(page.getByRole("button", { name: "استئناف المحاولة", exact: true })).toHaveCount(0);
  expect(api.starts()).toHaveLength(1); expect(api.finishes()).toHaveLength(1);
  await page.getByRole("button", { name: "تجهيز مشارك آخر" }).click();
  await page.getByRole("button", { name: "لوحة المتصدرين", exact: true }).click();
  await expect(page.locator(".leaderboard-points strong")).toHaveText("100");
});

test("stale, forged, mismatched and invalid-score messages cannot reach Finish", async ({ page }) => {
  const api = await backend(page), old = await launch(page);
  const oldNonce = nonceOf(old), oldWindow = await page.evaluateHandle(() => document.querySelector("iframe")!.contentWindow);
  await page.getByRole("button", { name: "طلب مساعدة" }).click();
  await page.getByRole("button", { name: "العودة إلى شاشة الموظف" }).click();
  await page.getByRole("button", { name: "استئناف المحاولة", exact: true }).click();
  const frame = await ready(page), nonce = nonceOf(frame), valid = packet(100, nonce);
  await page.evaluate(({ data, oldWindow }) => {
    window.postMessage(data, "*");
    window.dispatchEvent(new MessageEvent("message", { origin: "null", source: oldWindow, data }));
    window.dispatchEvent(new MessageEvent("message", { origin: location.origin, source: document.querySelector("iframe")!.contentWindow, data }));
  }, { data: valid, oldWindow });
  await send(frame, packet(100, oldNonce));
  for (const finalScore of [-1, 101, 1.5, "100", NaN, Infinity]) await send(frame, { ...valid, payload: { ...valid.payload, finalScore } });
  for (const patch of [{ game: "qa" }, { maxScore: 500 }, { correctAnswers: 9 }, { answers: [] }]) await send(frame, { ...valid, payload: { ...valid.payload, ...patch } });
  await send(frame, { ...valid, type: "robomaze" });
  await page.waitForTimeout(300);
  expect(api.finishes()).toHaveLength(0); expect(await warns(page)).toBe(false);
  await expect(page.locator(".result-embedded")).toHaveCount(0);
  await send(frame, packet(0, nonce));
  await expect(page.locator(".result-score b")).toHaveText("0");
  expect(api.finishes().map(c => c.body)).toEqual([{ attempt_id: attemptId, score: 0 }]);
});

test("lost Finish response is recovered by Progress without resubmitting or starting another attempt", async ({ page }) => {
  await page.clock.install();
  const api = await backend(page), frame = await launch(page); api.setFinish("lost");
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  await send(frame, packet(50, nonceOf(frame)));
  await expect(page.locator(".result-card").getByRole("alert")).toContainText("تعذّر تأكيد");
  await page.clock.runFor(15000);
  expect(await warns(page)).toBe(true);
  await expect(page.locator(".result-embedded")).not.toContainText("العودة إلى اختيار ألعابك خلال");
  await page.getByRole("button", { name: "التحقق من حالة الحفظ", exact: true }).click();
  await expect(page.locator(".result-score b")).toHaveText("50");
  expect(api.finishes()).toHaveLength(1); expect(api.starts()).toHaveLength(1);
  expect(await warns(page)).toBe(false);
});

test("a pre-save network failure can retry the same score and attempt after checking Progress", async ({ page }) => {
  const api = await backend(page), frame = await launch(page); api.setFinish("offline");
  await send(frame, packet(80, nonceOf(frame)));
  await expect(page.locator(".result-card").getByRole("alert")).toContainText("تعذّر تأكيد");
  api.setFinish("pending");
  await page.getByRole("button", { name: "إعادة محاولة الحفظ", exact: true }).click();
  await expect.poll(() => api.finishes().length).toBe(2);
  await expect(page.getByRole("heading", { name: "جارٍ التحقق من الحالة وإعادة الحفظ عند الحاجة…" })).toBeVisible();
  expect(await warns(page)).toBe(true);
  api.release(); await expect(page.locator(".result-score b")).toHaveText("80");
  expect(api.finishes().map(c => c.body)).toEqual([{ attempt_id: attemptId, score: 80 }, { attempt_id: attemptId, score: 80 }]);
  expect(api.starts()).toHaveLength(1); expect(api.attempt()?.status).toBe("completed");
});

for (const field of ["id", "student_id", "game_id"] as const) test(`mismatched Finish ${field} never confirms saving or starts the countdown`, async ({ page }) => {
  const api = await backend(page), frame = await launch(page); api.setFinish(field);
  await send(frame, packet(60, nonceOf(frame)));
  await expect(page.locator(".result-card").getByRole("alert")).toContainText("تعذّر اعتماد بيانات الخدمة");
  await expect(page.locator(".result-score")).toHaveCount(0); expect(await warns(page)).toBe(true);
  await page.getByRole("button", { name: "التحقق من حالة الحفظ", exact: true }).click();
  await expect(page.locator(".result-score b")).toHaveText("60");
  expect(api.finishes()).toHaveLength(1); expect(api.starts()).toHaveLength(1);
});

test("lost Start response recovers the reserved attempt and resumes without a second Start", async ({ page }) => {
  const api = await backend(page); api.loseStart(); await identify(page); await select(page);
  await page.getByRole("button", { name: "ابدأ اللعب", exact: true }).click();
  await expect(page.locator(".attempt-panel").getByRole("alert")).toContainText("لم يصل تأكيد البدء");
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.getByRole("button", { name: "التحقق من حالة المحاولة", exact: true }).click();
  await page.getByRole("button", { name: "استئناف المحاولة", exact: true }).click();
  const frame = await ready(page); await expect(frame.locator("#timer")).toHaveText("03:00");
  expect(api.attempt()?.id).toBe(attemptId); expect(api.starts()).toHaveLength(1);
});

test("the original game emits its real timeout result to Live Finish and keeps its ending locked", async ({ page }) => {
  const api = await backend(page), frame = await launch(page);
  await frame.locator("#startButton").click();
  await frame.evaluate(() => {
    const original = requestAnimationFrame.bind(window); let extra = 0;
    window.requestAnimationFrame = callback => original(time => { extra += 250; callback(time + extra); });
  });
  await expect(page.locator(".result-score b")).toHaveText("0", { timeout: 30000 });
  await expect(frame.locator("#resultScreen")).toBeVisible();
  expect(api.finishes().map(call => call.body)).toEqual([{ attempt_id: attemptId, score: 0 }]);
  expect(await frame.evaluate(() => {
    const game = (window as unknown as { RoboMaze: { start(): void; getState(): { running: boolean } } }).RoboMaze;
    game.start();
    return { inert: document.body.inert, running: game.getState().running };
  })).toEqual({ inert: true, running: false });
});
