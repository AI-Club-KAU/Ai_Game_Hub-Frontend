import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "./fixtures";
import { TEST_API_BASE_URL } from "./test-environment";
import { devPacket } from "./dev-run-test-helpers";
import { wasselPacket } from "./wassel-tareeqak-test-helpers";

// Test-only memory, shared by intercepted requests in ONE browser test session.
// Nothing is forwarded, persisted, or installed in the application.
const ACCESS_CODE = "offline-test-only";
const TOKEN = "manual-offline-dummy-token";
const names = ["ESCAPE.EXE", "Dev Run", "وصّل طريقك", "Game 4", "Game 5"];
type Student = { id: string; student_number: string; full_name: string };
type Attempt = { id: string; student_id: string; game_id: number; status: "started" | "completed";
  score: number | null; play_date: string; started_at: string };
type Reply = { status: number; data: Record<string, unknown> };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function simulatedBackend() {
  const students = new Map<string, Student>();
  const attempts = new Map<string, Attempt>();
  const date = new Date().toISOString().slice(0, 10);
  students.set("00123", { id: randomUUID(), student_number: "00123", full_name: "مشارك التجربة المحلية" });
  const completed = (id: string) => [...attempts.values()].filter(a => a.student_id === id && a.status === "completed");
  const totals = (id: string) => ({ total_score: completed(id).reduce((sum, a) => sum + a.score!, 0), games_completed: completed(id).length });
  const ok = (data: Record<string, unknown>, status = 200): Reply => ({ status, data });
  const error = (code: string, status: number): Reply => ok({ error: { code } }, status);

  function handle(method: string, path: string, body: unknown, authorized: boolean): Reply {
    const value = object(body) ? body : {};
    if (method === "POST" && path === "/access/verify") {
      return value.access_code === ACCESS_CODE ? ok({ access_token: TOKEN, token_type: "Bearer", expires_in: 86400 }) : error("invalid_access_code", 401);
    }
    if (!authorized) return error("invalid_platform_token", 401);
    if (method === "POST" && ["/students/register", "/students/login"].includes(path)) {
      const number = value.student_number;
      if (typeof number !== "string" || !/^\d{1,32}$/.test(number)) return error("invalid_input", 400);
      let student = students.get(number);
      if (path === "/students/register") {
        if (student) return error("student_number_exists", 409);
        if (typeof value.full_name !== "string" || !value.full_name.trim()) return error("invalid_input", 400);
        student = { id: randomUUID(), student_number: number, full_name: value.full_name };
        students.set(number, student);
      }
      return student ? ok({ student: { ...student } }, path.endsWith("register") ? 201 : 200) : error("student_not_found", 404);
    }
    const progress = /^\/students\/([^/]+)\/progress$/.exec(path);
    if (method === "GET" && progress) {
      const student = [...students.values()].find(s => s.id === progress[1]);
      if (!student) return error("student_not_found", 404);
      return ok({ student_id: student.id, play_date: date, ...totals(student.id), games: names.map((name, index) => {
        const id = index + 1;
        const attempt = [...attempts.values()].find(a => a.student_id === student.id && a.game_id === id);
        return { id, name, max_score: 100, is_active: id <= 3, attempt: attempt ? { ...attempt } : null, eligible_to_start: id <= 3 && !attempt };
      }) });
    }
    if (method === "POST" && path === "/attempts/start") {
      if (![1, 2, 3].includes(value.game_id as number) || ![...students.values()].some(s => s.id === value.student_id)) return error("invalid_input", 400);
      if ([...attempts.values()].some(a => a.student_id === value.student_id && a.game_id === value.game_id)) return error("game_already_attempted", 409);
      const attempt: Attempt = { id: randomUUID(), student_id: value.student_id as string, game_id: value.game_id as number,
        status: "started", score: null, play_date: date, started_at: new Date().toISOString() };
      attempts.set(attempt.id, attempt);
      return ok({ attempt: { ...attempt } }, 201);
    }
    if (method === "POST" && path === "/attempts/finish") {
      if (typeof value.attempt_id !== "string" || typeof value.score !== "number" || !Number.isInteger(value.score) || value.score < 0 || value.score > 100) return error("invalid_input", 400);
      const attempt = attempts.get(value.attempt_id);
      if (!attempt) return error("attempt_not_found", 404);
      if (attempt.status === "completed") return error("attempt_already_completed", 409);
      attempt.status = "completed"; attempt.score = value.score;
      return ok({ attempt: { ...attempt }, score_saved: true, total_available: true, ...totals(attempt.student_id) });
    }
    if (method === "GET" && path === "/leaderboard") {
      return ok({ leaderboard: [...students.values()].filter(s => completed(s.id).length > 0)
        .map(s => ({ full_name: s.full_name, ...totals(s.id) })).sort((a, b) => b.total_score - a.total_score).slice(0, 3) });
    }
    throw new Error(`Unmocked manual-session API: ${method} ${path}`);
  }
  async function install(page: Page) {
    // Only this deliberately non-routable test destination gets simulated responses.
    // All other destinations remain subject to fixtures.ts/network-isolation.ts.
    await page.route(TEST_API_BASE_URL + "/**", async route => {
      const request = route.request();
      const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type",
        "access-control-allow-methods": "GET,POST,OPTIONS" };
      if (request.method() === "OPTIONS") { await route.fulfill({ status: 204, headers }); return; }
      try {
        const path = new URL(request.url()).pathname.slice(new URL(TEST_API_BASE_URL).pathname.length);
        const body: unknown = request.postData() ? request.postDataJSON() : undefined;
        const reply = handle(request.method(), path, body, request.headers().authorization === `Bearer ${TOKEN}`);
        await route.fulfill({ status: reply.status, headers, contentType: "application/json", body: JSON.stringify(reply.data) });
      } catch (error) { await route.abort(); throw error; }
    });
  }
  return { handle, install };
}

async function identify(page: Page) {
  await page.goto("/");
  await page.locator("#access-code").fill(ACCESS_CODE);
  await page.getByRole("button", { name: "الدخول إلى البوث" }).click();
  await page.getByRole("button", { name: "تجهيز البوث", exact: true }).click();
  await page.getByRole("button", { name: "مشارك سابق", exact: true }).click();
  await page.locator("#participant-id").fill("00123");
  await page.getByRole("button", { name: "استرجاع المشارك", exact: true }).click();
  await expect(page.locator('input[name="eligible-game"]')).toHaveCount(5);
}

test("manual simulator keeps per-participant attempts, zero scores and duplicate protection in memory", () => {
  const api = simulatedBackend();
  const call = (path: string, body?: unknown, method = "POST") => api.handle(method, path, body, true);
  const student = call("/students/login", { student_number: "00123" }).data.student as Student;
  expect(api.handle("POST", "/attempts/start", { student_id: student.id, game_id: 1 }, false).status).toBe(401);
  for (const game_id of [1, 2, 3]) {
    const attempt = call("/attempts/start", { student_id: student.id, game_id }).data.attempt as Attempt;
    expect(call("/attempts/start", { student_id: student.id, game_id }).status).toBe(409);
    const progress = call(`/students/${student.id}/progress`, undefined, "GET").data.games as { id: number; attempt: Attempt | null }[];
    expect(progress.find(g => g.id === game_id)?.attempt?.id).toBe(attempt.id);
    expect(call("/attempts/finish", { attempt_id: attempt.id, score: 0.5 }).status).toBe(400);
    expect(call("/attempts/finish", { attempt_id: attempt.id, score: game_id === 1 ? 0 : 100 }).status).toBe(200);
    expect(call("/attempts/finish", { attempt_id: attempt.id, score: 50 }).status).toBe(409);
  }
  expect(call(`/students/${student.id}/progress`, undefined, "GET").data).toMatchObject({ total_score: 200, games_completed: 3 });
  expect(call("/attempts/start", { student_id: student.id, game_id: 4 }).status).toBe(400);
  const second = call("/students/register", { student_number: "00999", full_name: "مشارك وهمي ثانٍ" }).data.student as Student;
  expect(call(`/students/${second.id}/progress`, undefined, "GET").data).toMatchObject({ total_score: 0, games_completed: 0 });
  expect(call("/students/register", { student_number: "00999", full_name: "آخر" }).status).toBe(409);
});

test("manual-session fixture launches all three assets, resumes after refresh and retains completed games", async ({ page }) => {
  test.setTimeout(60000);
  await page.clock.install();
  const api = simulatedBackend(); await api.install(page); await identify(page);
  for (const [index, game] of ["escape-exe", "dev-run", "wassel-tareeqak"].entries()) {
    const id = String(index + 1);
    await page.locator(`input[name="eligible-game"][value="${id}"]`).check();
    await page.getByRole("button", { name: "تأكيد اختيار اللعبة" }).click();
    await page.getByRole("button", { name: "ابدأ اللعب", exact: true }).click();
    await expect(page.locator(".game-mode-footer")).toContainText("تم تحميل صفحة اللعبة");
    let frame = page.frames().find(f => f.url().includes(`/games/${game}/`))!;
    const previousNonce = new URL(frame.url()).searchParams.get("nonce");
    if (index === 0) {
      await page.reload(); await identify(page);
      await page.getByRole("button", { name: "استئناف المحاولة", exact: true }).click();
      await expect(page.locator(".game-mode-footer")).toContainText("تم تحميل صفحة اللعبة");
      frame = page.frames().find(f => f.url().includes(`/games/${game}/`))!;
      expect(new URL(frame.url()).searchParams.get("nonce")).not.toBe(previousNonce);
    }
    const nonce = new URL(frame.url()).searchParams.get("nonce")!;
    // Host-flow smoke only; manual session below never injects results or changes clocks.
    const packet = index === 0 ? { type: "robomaze:result", nonce, payload: { game: "escape-exe", finalScore: 0, maxScore: 100,
      correctAnswers: 0, questionsAnswered: 10, escaped: false, timeRemaining: 0, durationSeconds: 180,
      answers: Array.from({ length: 10 }, (_, i) => ({ checkpoint: i + 1, system: "Test", result: "wrong" })) } } :
      index === 1 ? devPacket(100, nonce) : wasselPacket(100, nonce);
    await frame.evaluate(packet => parent.postMessage(packet, "*"), packet);
    await expect(page.getByRole("heading", { name: "تم تأكيد حفظ النتيجة" })).toBeVisible();
    await page.clock.runFor(10000);
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(page.locator(`input[name="eligible-game"][value="${id}"]`)).toBeDisabled();
    await expect(page.locator(".participant-details dd").last()).toHaveText("00123");
  }
  await expect(page.locator(".progress-stats strong").first()).toHaveText("200 / 500");
  await expect(page.locator('input[name="eligible-game"]:enabled')).toHaveCount(0);
});

test("interactive offline session — play all three real games manually", async ({ page, headless }) => {
  test.skip(process.env.MANUAL_GAME_TEST !== "1", "Explicit opt-in only; never pause the automated suite");
  test.setTimeout(0);
  expect(process.env.NEXT_PUBLIC_API_MODE, "Use the isolated Live test server").toBe("live");
  expect(headless, "Launch this session with --headed").toBe(false);
  const api = simulatedBackend(); await api.install(page); await identify(page);
  console.log("OFFLINE MANUAL SESSION: play in this Chrome window only. Dummy participant 00123; access code offline-test-only. No real credentials or services. Close with Ctrl+C in PowerShell; Resume in Inspector also ends this test. State stays only in this running test's memory.");
  // Test execution pauses; browser JavaScript, original game timers and manual input keep running normally.
  await page.pause();
});
