import { activeAttemptsFor } from "./mock-attempt-store";
import { savedResults } from "./mock-result-service";
import type { ApprovedResult, BoothSection, EligibilityService, EventDay } from "./eligibility-service";
export type DemoHistory = "new" | "previous" | "played-today" | "repeated" | "active" | "complete" | "mock";
export type EligibilityDemoConfig = { day: EventDay; section: BoothSection; history: DemoHistory; offline: boolean };
const defaults: EligibilityDemoConfig = { day: 3, section: "students", history: "new", offline: false };
let configuration = { ...defaults };
export const eligibilityDemo = {
  getConfig: () => ({ ...configuration }),
  configure: (next: EligibilityDemoConfig) => { configuration = { ...next }; },
  reset: () => { configuration = { ...defaults }; },
};
const title = (id: string) => "لعبة تجريبية " + id.padStart(2, "0");
function history(config: EligibilityDemoConfig): ApprovedResult[] {
  const result = (id: string, day: EventDay, score: number) => ({ gameId: id, gameTitle: title(id), day, score });
  if (config.history === "complete") return [1, 2, 3, 4, 5].map(day => result(String(day), day as EventDay, 100));
  if (config.history === "played-today") return [result(String(config.day), config.day, 80)];

  if (config.history === "previous") return [result("1", 1, 75)];
  if (config.history === "repeated") return [result(String(config.day), Math.max(1, config.day - 1) as EventDay, 65)];
  return [];
}
export const mockEligibilityService: EligibilityService = {
  async load(participantIdentifier) {
    const config = { ...configuration };
    await new Promise(resolve => setTimeout(resolve, 650));
    if (config.offline) throw new Error("Mock eligibility unavailable");
    const actual = [...savedResults.values()].filter(result => result.participantIdentifier === participantIdentifier);
    const results = [...history(config).filter(result => !actual.some(saved => saved.gameId === result.gameId)), ...actual];
    const active = activeAttemptsFor(participantIdentifier);
    const ids = config.history === "mock" ? ["mock"] : ["1", "2", "3", "4", "5"];
    const games = ids.map(id => {
      const completed = results.some(result => result.gameId === id);
      const pending = active.some(attempt => attempt.gameId === id) || (config.history === "active" && id === "3");
      const reason = pending ? "توجد محاولة قيد التنفيذ لهذه اللعبة؛ استأنفها دون بدء جديد." : completed ? "أكمل هذه اللعبة سابقًا؛ متاحة مرة واحدة طوال الفعالية." : "متاحة للمشاركة.";
      return { id, title: id === "mock" ? "ESCAPE.EXE" : title(id), maxScore: 100, eligible: !pending && !completed, reason };
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
