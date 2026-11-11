import { activeAttemptFor } from "./mock-attempt-store";
import type { ApprovedResult, BoothSection, EligibilityService, EventDay } from "./eligibility-service";
export type DemoHistory = "new" | "previous" | "played-today" | "repeated" | "active" | "complete";
export type EligibilityDemoConfig = { day: EventDay; section: BoothSection; history: DemoHistory; offline: boolean };
const defaults: EligibilityDemoConfig = { day: 3, section: "students", history: "new", offline: false };
let configuration = { ...defaults };
export const eligibilityDemo = {
  getConfig: () => ({ ...configuration }),
  configure: (next: EligibilityDemoConfig) => { configuration = { ...next }; },
  reset: () => { configuration = { ...defaults }; },
};
const title = (id: string) => "لعبة تجريبية " + id.padStart(2, "0");
/** Explicit synthetic schedule: day 3 is exceptional only in this demo, not an event decision. */
function schedule(day: EventDay, section: BoothSection) {
  return day === 3 && section === "female-students" ? ["3", "4"] : [String(day)];
}
function history(config: EligibilityDemoConfig): ApprovedResult[] {
  const result = (id: string, day: EventDay, score: number) => ({ gameId: id, gameTitle: title(id), day, score });
  if (config.history === "complete") return [1, 2, 3, 4, 5].map(day => result(String(day), day as EventDay, 100));
  if (config.history === "played-today") return [result(String(config.day), config.day, 80)];
  if (config.day === 1) return []; // No prior event day exists.
  if (config.history === "previous") return [result("1", 1, 75)];
  if (config.history === "repeated") return [result(String(config.day), (config.day - 1) as EventDay, 65)];
  return [];
}
export const mockEligibilityService: EligibilityService = {
  async load(participantIdentifier) {
    const config = { ...configuration };
    await new Promise(resolve => setTimeout(resolve, 650));
    if (config.offline) throw new Error("Mock eligibility unavailable");
    const results = history(config);
    const playedToday = results.some(result => result.day === config.day);
    const active = config.history === "active" || Boolean(activeAttemptFor(participantIdentifier));
    const availableIds = schedule(config.day, config.section);
    const games = [1, 2, 3, 4, 5].map(number => {
      const id = String(number);
      const completed = results.some(result => result.gameId === id);
      const reason = active ? "توجد محاولة قيد التنفيذ؛ يلزم التحقق من حالتها." : playedToday ? "شارك اليوم بالفعل؛ لعبة واحدة فقط في اليوم." : completed ? "أكمل هذه اللعبة سابقًا؛ متاحة مرة واحدة طوال الفعالية." : !availableIds.includes(id) ? "غير مجدولة لهذا اليوم والقسم." : "متاحة للمشاركة اليوم.";
      return { id, title: title(id), maxScore: 100, eligible: !active && !playedToday && !completed && availableIds.includes(id), reason };
    });
    const eligible = games.some(game => game.eligible);
    return {
      participantIdentifier, section: config.section, day: config.day,
      status: eligible ? "eligible" : "blocked",
      message: eligible ? "يمكن للمشارك اختيار لعبة واحدة من الألعاب المتاحة." : active ? "توجد محاولة قيد التنفيذ. لا يمكن اختيار محاولة أخرى." : playedToday ? "اكتملت مشاركة اليوم. يمكن العودة في يوم آخر وفق الجدول." : "لا توجد ألعاب مؤهلة للمشارك اليوم وفق الجدول وسجله.",
      games, results, totalScore: results.reduce((total, result) => total + result.score, 0),
    };
  },
};
