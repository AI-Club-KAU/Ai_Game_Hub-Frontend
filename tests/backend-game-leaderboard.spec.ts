import { test, expect } from "./fixtures";
import { createBackendGameLeaderboardService, validateGameLeaderboard } from "../src/services/backend-game-leaderboard-service";
import { platformSession } from "../src/services/platform-session";
import { TEST_API_BASE_URL } from "./test-environment";

const response = { game_id: 1, max_score: 100, leaderboard: [{ full_name: "B", score: 100 }, { full_name: "A", score: 100 }, { full_name: "C", score: 0 }] };
test.afterEach(() => platformSession.clear());

test("per-game response validation preserves tied API order, accepts empty/ten and rejects malformed data", () => {
  expect(validateGameLeaderboard(response, "1").entries).toEqual([
    { rank: 1, displayName: "B", score: 100 }, { rank: 2, displayName: "A", score: 100 }, { rank: 3, displayName: "C", score: 0 },
  ]);
  expect(validateGameLeaderboard({ ...response, leaderboard: [] }, "1").entries).toEqual([]);
  expect(validateGameLeaderboard({ ...response, leaderboard: Array.from({ length: 10 }, (_, i) => ({ full_name: "Test " + i, score: 100 - i })) }, "1").entries).toHaveLength(10);
  for (const data of [null, [], {}, { ...response, game_id: "1" }, { ...response, game_id: 2 }, { ...response, max_score: 500 },
    { ...response, leaderboard: null }, { ...response, leaderboard: Array(11).fill({ full_name: "X", score: 1 }) },
    ...[-1, 101, 0.5, NaN, Infinity, "100", null].map(score => ({ ...response, leaderboard: [{ full_name: "X", score }] })),
    ...[null, {}, { full_name: " ", score: 0 }, { full_name: 123, score: 0 }].map(row => ({ ...response, leaderboard: [row] })),
    { ...response, leaderboard: [{ full_name: "X", score: 0 }, { full_name: "Y", score: 100 }] },
  ]) expect(() => validateGameLeaderboard(data, "1")).toThrow();
});

test("deployment gate and invalid game IDs reject before authentication or network activity", async () => {
  platformSession.clear(); let calls = 0;
  const transport: typeof fetch = async () => { calls++; throw new Error("must not run"); };
  const locked = createBackendGameLeaderboardService(TEST_API_BASE_URL, { transport });
  expect(locked.availability).toBe("awaiting-deployment");
  await expect(locked.load("1")).rejects.toThrow("تأكيد نشر");
  const enabled = createBackendGameLeaderboardService(TEST_API_BASE_URL, { transport, deploymentConfirmed: true });
  for (const id of ["mock", "01", "1.0", "0", "6", "", 1, NaN, Infinity, null]) await expect(enabled.load(id as "1")).rejects.toThrow();
  expect(calls).toBe(0); expect(platformSession.needsRenewal()).toBe(false);
});

test("typed client uses GET, exact game routing and existing bearer authentication without leaking fields", async () => {
  platformSession.accept("offline-leaderboard-token", 3600);
  const calls: { url: string; init?: RequestInit }[] = [];
  const api = createBackendGameLeaderboardService(TEST_API_BASE_URL, { deploymentConfirmed: true, transport: async (input, init) => {
    calls.push({ url: String(input), init });
    const game_id = Number(String(input).split("/").at(-1));
    return new Response(JSON.stringify({ ...response, game_id, leaderboard: [{ full_name: "Test", score: 100, student_id: "must-not-leak" }] }));
  } });
  for (const id of ["1", "2", "3", "4", "5"] as const) {
    const data = await api.load(id);
    expect(data.gameId).toBe(id);expect(data.maxScore).toBe(100);
    expect(Object.keys(data.entries[0]).sort()).toEqual(["displayName", "rank", "score"]);
  }
  expect(calls.map(c => c.url)).toEqual([1, 2, 3, 4, 5].map(id => TEST_API_BASE_URL + "/leaderboard/games/" + id));
  for (const { init } of calls) {
    expect(init?.method).toBe("GET");expect(init?.body).toBeUndefined();
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer offline-leaderboard-token");
  }
});

test("expired authentication renews through the existing session mechanism before retrying the GET", async () => {
  platformSession.accept("old-dummy-token", 3600);const tokens: (string | null)[] = [];
  const api = createBackendGameLeaderboardService(TEST_API_BASE_URL, { deploymentConfirmed: true, transport: async (_input, init) => {
    tokens.push(new Headers(init?.headers).get("Authorization"));
    return tokens.length === 1 ? new Response(JSON.stringify({ error: { code: "invalid_platform_token" } }), { status: 401 }) : new Response(JSON.stringify(response));
  } });
  const pending = api.load("1");
  await expect.poll(() => platformSession.needsRenewal()).toBe(true);
  platformSession.accept("new-dummy-token", 3600);
  expect((await pending).entries).toHaveLength(3);
  expect(tokens).toEqual(["Bearer old-dummy-token", "Bearer new-dummy-token"]);
});

test("Live tabs stay unavailable without calling the future endpoint; Overall stays on its existing route", async ({ page }) => {
  const paths: string[] = [];
  await page.route(TEST_API_BASE_URL + "/**", async route => {
    const path = new URL(route.request().url()).pathname.slice(new URL(TEST_API_BASE_URL).pathname.length);paths.push(path);
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type" } });
    const json = (data: unknown) => route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
    if (path === "/access/verify") return json({ access_token: "local-only-token", token_type: "Bearer", expires_in: 3600 });
    expect(route.request().headers().authorization).toBe("Bearer local-only-token");
    if (path === "/leaderboard") return json({ leaderboard: [{ full_name: "Overall test", total_score: 500, games_completed: 5 }] });
    await route.abort();throw new Error("Unexpected route: " + path);
  });
  await page.goto("/");await page.locator("#access-code").fill("offline-test-only");
  await page.getByRole("button", { name: "الدخول إلى البوث" }).click();await page.getByRole("button", { name: "تجهيز البوث", exact: true }).click();
  await page.getByRole("button", { name: "لوحة المتصدرين", exact: true }).click();
  await expect(page.locator(".leaderboard-points strong")).toHaveText("500");
  for (const name of ["ESCAPE.EXE", "Dev Run", "وصّل طريقك", "Game 4", "Game 5"]) {
    await page.getByRole("tab", { name, exact: true }).click();
    await expect(page.getByRole("heading", { name: "ترتيب اللعبة غير متاح بعد" })).toBeVisible();
    await expect(page.locator(".leaderboard-row")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "تحديث الترتيب" })).toBeDisabled();
  }
  expect(paths.filter(path => path.startsWith("/leaderboard/games/"))).toEqual([]);
  await expect(page.locator("main")).toContainText("غير متاحة للعب في Live");
  await page.getByRole("tab", { name: "Overall", exact: true }).click();
  await expect(page.locator(".leaderboard-points strong")).toHaveText("500");
});
