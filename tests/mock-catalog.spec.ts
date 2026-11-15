import { test, expect, type Page } from "@playwright/test";
import { MOCK_GAME_CATALOG, MOCK_MAX_POINTS, MockHistoryConflict } from "../src/services/mock-game-catalog";
import { eligibilityDemo, mockEligibilityService, type DemoHistory } from "../src/services/mock-eligibility-service";
import { activeAttempts } from "../src/services/mock-attempt-store";
import { mockAttemptService, attemptDemo } from "../src/services/mock-attempt-service";
import { savedResults, mockResultService, resultDemo } from "../src/services/mock-result-service";
import { mockLeaderboardService, leaderboardDemo } from "../src/services/mock-leaderboard-service";
import type { SavedResult } from "../src/services/result-service";
import type { GameAttempt } from "../src/services/attempt-service";

const ids = ["mock", "2", "3", "4", "5"];
const histories: DemoHistory[] = ["new", "previous", "played-today", "repeated", "active", "complete", "mock"];
const stored = (id: string, gameId: string, identifier = "catalog-person"): SavedResult => ({ attemptId: id, participantIdentifier: identifier, gameId, gameTitle: "Stored title", day: 3, score: 100 });
const unfinished = (id: string, gameId: string, identifier = "catalog-person"): GameAttempt => ({ id, participantIdentifier: identifier, gameId, gameTitle: "Stored title", day: 3, section: "students", status: "active" });

test.afterEach(() => { eligibilityDemo.reset(); attemptDemo.setMode("normal"); resultDemo.reset(); leaderboardDemo.reset(); });

test("every scenario uses exactly the same five identities and bounds", async () => {
  expect(MOCK_GAME_CATALOG.map(game => game.id)).toEqual(ids);
  expect(MOCK_MAX_POINTS).toBe(500);
  for (const history of histories) {
    eligibilityDemo.configure({ day: 3, section: "students", history, offline: false });
    const data = await mockEligibilityService.load("catalog-empty");
    expect(data.games.map(game => game.id)).toEqual(ids);
    expect(data.games.map(game => game.maxScore)).toEqual([100, 100, 100, 100, 100]);
    expect(new Set(data.results.map(result => result.gameId)).size).toBe(data.results.length);
    expect(data.results.length).toBeLessThanOrEqual(5); expect(data.totalScore).toBeLessThanOrEqual(500);
  }
});

test("scenario changes cannot accumulate fake completions or replace real results and unfinished attempts", async () => {
  const result = { ...stored("catalog-real", "mock"), score: 80 };
  const attempt = unfinished("catalog-active", "3");
  savedResults.set(result.attemptId, result); activeAttempts.set(attempt.id, attempt);
  try {
    for (const history of histories) {
      eligibilityDemo.configure({ day: 3, section: "students", history, offline: false });
      const data = await mockEligibilityService.load("catalog-person");
      expect(data.results.find(row => row.gameId === "mock")?.score).toBe(80);
      expect(data.results.some(row => row.gameId === "3")).toBe(false);
      expect(data.games.find(game => game.id === "3")?.eligible).toBe(false);
      expect(new Set(data.results.map(row => row.gameId)).size).toBe(data.results.length);
      expect(data.results.length).toBeLessThanOrEqual(4); expect(data.totalScore).toBeLessThanOrEqual(380);
    }
    expect(savedResults.get(result.attemptId)).toBe(result); expect(activeAttempts.get(attempt.id)).toBe(attempt);
    const restored = await mockAttemptService.listActive!("catalog-person");
    expect(restored).toEqual([attempt]);
  } finally { savedResults.delete(result.attemptId); activeAttempts.delete(attempt.id); }
});

for (const legacy of ["result", "attempt"] as const) {
  test(`legacy QA 01 ${legacy} stays distinct and blocks totals, Start, resume and leaderboard`, async () => {
    const id = "legacy-" + legacy;
    const oldResult = stored(id, "1"), oldAttempt = unfinished(id, "1");
    if (legacy === "result") savedResults.set(id, oldResult); else activeAttempts.set(id, oldAttempt);
    try {
      await expect(mockEligibilityService.load("catalog-person")).rejects.toThrow(MockHistoryConflict);
      await expect(mockEligibilityService.load("catalog-person")).rejects.toThrow("خارج الكتالوج (1)");
      await expect(mockAttemptService.listActive!("catalog-person")).rejects.toThrow(MockHistoryConflict);
      const start = await mockAttemptService.start({ requestId: crypto.randomUUID(), participantIdentifier: "catalog-person", gameId: "mock", day: 3, section: "students" });
      expect(start.status).toBe("rejected");
      if (start.status === "rejected") expect(start.message).toContain("لم تُحذف أو تُحوّل أي بيانات");
      const save = await mockResultService.save({ attemptId: id, score: 100 });
      expect(save.status).toBe("rejected");
      if (save.status === "rejected") expect(save.message).toContain("تعارض في بيانات Mock");
      await expect(mockResultService.inspect(id)).rejects.toThrow(MockHistoryConflict);
      await expect(mockLeaderboardService.load()).rejects.toThrow(MockHistoryConflict);
      expect(savedResults.has(id)).toBe(legacy === "result"); expect(activeAttempts.has(id)).toBe(legacy === "attempt");
      if (legacy === "result") expect(savedResults.get(id)).toBe(oldResult); else expect(activeAttempts.get(id)).toBe(oldAttempt);
      expect([...savedResults.values()].some(row => row.participantIdentifier === "catalog-person" && row.gameId === "mock")).toBe(false);
    } finally { savedResults.delete(id); activeAttempts.delete(id); }
  });
}

test("duplicate stored completions and overlapping attempts cause an explicit conflict without changing records", async () => {
  const first = stored("duplicate-a", "2"), second = stored("duplicate-b", "2");
  savedResults.set(first.attemptId, first); savedResults.set(second.attemptId, second);
  try {
    await expect(mockEligibilityService.load("catalog-person")).rejects.toThrow("مكررة");
    await expect(mockLeaderboardService.load()).rejects.toThrow(MockHistoryConflict);
    expect(savedResults.get(first.attemptId)).toBe(first); expect(savedResults.get(second.attemptId)).toBe(second);
    savedResults.delete(second.attemptId);
    const attempt = unfinished("overlap", "2"); activeAttempts.set(attempt.id, attempt);
    try { await expect(mockAttemptService.listActive!("catalog-person")).rejects.toThrow(MockHistoryConflict); }
    finally { activeAttempts.delete(attempt.id); }
  } finally { savedResults.delete(first.attemptId); savedResults.delete(second.attemptId); }
});

test("unknown games are rejected without creating attempts", async () => {
  const result = await mockAttemptService.start({ requestId: crypto.randomUUID(), participantIdentifier: "catalog-unknown", gameId: "1", day: 3, section: "students" });
  expect(result.status).toBe("rejected"); expect([...activeAttempts.values()].some(row => row.participantIdentifier === "catalog-unknown")).toBe(false);
});

async function openParticipant(page: Page) {
  await page.goto("/"); await page.locator("#access-code").fill("demo");
  await page.getByRole("button", { name: "الدخول إلى البوث" }).click();
  await page.getByRole("button", { name: "تجهيز البوث", exact: true }).click();
  await page.getByRole("button", { name: "مشارك سابق", exact: true }).click();
  await page.locator("#participant-id").fill("00123");
  await page.getByRole("button", { name: "استرجاع المشارك", exact: true }).click();
}

test("default mixed catalog stays fixed across all visible scenarios and each asset can launch", async ({ page }) => {
  test.setTimeout(60000);
  await openParticipant(page);
  await expect(page.locator('input[name="eligible-game"]')).toHaveCount(5);
  expect(await page.locator('input[name="eligible-game"]').evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value))).toEqual(ids);
  await page.getByText("إعدادات العرض التجريبي", { exact: true }).click();
  for (const history of histories) {
    await page.getByLabel("سجل تجريبي", { exact: true }).selectOption(history);
    await expect(page.locator('input[name="eligible-game"]')).toHaveCount(5);
    await expect(page.locator(".eligibility-loading")).toHaveCount(0);
    expect(await page.locator('input[name="eligible-game"]').evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value))).toEqual(ids);
  }
  await page.getByLabel("سجل تجريبي", { exact: true }).selectOption("new");
  for (const id of ids) {
    await page.locator(`input[name="eligible-game"][value="${id}"]`).check();
    await page.getByRole("button", { name: "تأكيد اختيار اللعبة" }).click();
    await page.getByRole("button", { name: "ابدأ اللعب", exact: true }).click();
    await expect(page.locator(".game-mode-footer")).toContainText(id === "mock" ? "تم تحميل صفحة اللعبة" : "الحاوية جاهزة");
    await expect(page.locator("iframe")).toHaveAttribute("src", id === "mock" ? /escape-exe/ : /container-check/);
    await page.getByRole("button", { name: "طلب مساعدة" }).click();
    await page.getByRole("button", { name: "العودة إلى شاشة الموظف" }).click();
    await expect(page.locator(".participant-details dd").last()).toHaveText("00123");
    await expect(page.locator(`input[name="eligible-game"][value="${id}"]`)).toBeDisabled();
  }
});
