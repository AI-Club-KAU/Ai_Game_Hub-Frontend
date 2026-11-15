import { activeAttemptsFor } from "./mock-attempt-store";
import { savedResults } from "./mock-result-service";
import type { ApprovedResult, BoothSection, EligibilityService, EventDay } from "./eligibility-service";
import { assertMockHistory, MOCK_GAME_CATALOG } from "./mock-game-catalog";
export type DemoHistory = "new" | "previous" | "played-today" | "repeated" | "active" | "complete" | "mock";
export type EligibilityDemoConfig = { day: EventDay; section: BoothSection; history: DemoHistory; offline: boolean };
const defaults: EligibilityDemoConfig = { day: 3, section: "students", history: "new", offline: false };
let configuration = { ...defaults };
export const eligibilityDemo = {
  getConfig: () => ({ ...configuration }),
  configure: (next: EligibilityDemoConfig) => { configuration = { ...next }; },
  reset: () => { configuration = { ...defaults }; },
};
function history(config: EligibilityDemoConfig): ApprovedResult[] {
  const result = (index: number, day: EventDay, score: number) => ({ gameId: MOCK_GAME_CATALOG[index].id, gameTitle: MOCK_GAME_CATALOG[index].title, day, score });
  if (config.history === "complete") return MOCK_GAME_CATALOG.map((game, index) => result(index, (index + 1) as EventDay, game.maxScore));
  if (config.history === "played-today") return [result(config.day - 1, config.day, 80)];
  if (config.history === "previous") return [result(0, 1, 75)];
  if (config.history === "repeated") return [result(config.day - 1, Math.max(1, config.day - 1) as EventDay, 65)];
  return [];
}
export const mockEligibilityService: EligibilityService = {
  async load(participantIdentifier) {
    const config = { ...configuration };
    await new Promise(resolve => setTimeout(resolve, 650));
    if (config.offline) throw new Error("Mock eligibility unavailable");
    const actual = [...savedResults.values()].filter(result => result.participantIdentifier === participantIdentifier);
    const active = activeAttemptsFor(participantIdentifier);
    assertMockHistory(actual, active);
    const simulated = history(config);
    // Actual results win; unfinished real attempts must not become simulated completions.
    const results = MOCK_GAME_CATALOG.flatMap(game => {
      const saved = actual.find(result => result.gameId === game.id);
      if (saved) return [saved];
      return active.some(attempt => attempt.gameId === game.id) ? [] : simulated.filter(result => result.gameId === game.id);
    });
    const games = MOCK_GAME_CATALOG.map(({ id, title, maxScore }) => {
      const completed = results.some(result => result.gameId === id);
      const pending = !completed && (active.some(attempt => attempt.gameId === id) || (config.history === "active" && id === "3"));
      const reason = pending ? "توجد محاولة قيد التنفيذ لهذه اللعبة؛ استأنفها دون بدء جديد." : completed ? "أكمل هذه اللعبة سابقًا؛ متاحة مرة واحدة طوال الفعالية." : "متاحة للمشاركة.";
      return { id, title, maxScore, eligible: !pending && !completed, reason };
    });
    const eligible = games.some(game => game.eligible);
    return {
      participantIdentifier, section: config.section, day: config.day,
      status: eligible ? "eligible" : "blocked",
      message: eligible ? "يمكنك اختيار لعبة متاحة؛ كل لعبة مرة واحدة طوال الفعالية." : "لا توجد ألعاب متاحة؛ راجع النتائج والمحاولات غير المكتملة.",
      games, results, totalScore: results.reduce((total, result) => total + result.score, 0),
    };
  },
};
