import { activeAttempts } from "./mock-attempt-store";
import type { ResultService, SavedResult } from "./result-service";
export const savedResults = new Map<string, SavedResult>();
type Mode = "normal" | "offline" | "lost-response" | "rejected";
let mode: Mode = "normal";
export const resultDemo = { getMode: () => mode, setMode: (value: Mode) => { mode = value; }, reset: () => { mode = "normal"; } };
const delay = () => new Promise(resolve => setTimeout(resolve, 700));
export const mockResultService: ResultService = {
  async save(request) {
    const scenario = mode;
    await delay();
    if (scenario === "offline") throw new Error("Offline");
    const existing = savedResults.get(request.attemptId);
    if (existing) return existing.score === request.score ? { status: "saved", result: { ...existing } } : { status: "rejected", message: "توجد نتيجة مختلفة محفوظة لهذه المحاولة؛ تحقق من حالة الحفظ." };
    const attempt = [...activeAttempts.values()].find(value => value.id === request.attemptId);
    if (!attempt || !Number.isInteger(request.score) || request.score < 0 || request.score > 100 || scenario === "rejected") return { status: "rejected", message: "لم تعتمد الخدمة النتيجة. أعد الجهاز إلى عضو النادي للتحقق." };
    const result: SavedResult = { ...request, participantIdentifier: attempt.participantIdentifier, gameId: attempt.gameId, gameTitle: attempt.gameTitle, day: attempt.day };
    // Atomic in this in-memory mock: one result per attempt, then close the attempt.
    savedResults.set(attempt.id, result);
    activeAttempts.delete(attempt.id);
    if (scenario === "lost-response") throw new Error("Response lost after saving");
    return { status: "saved", result: { ...result } };
  },
  async inspect(attemptId) {
    await delay();
    if (mode === "offline") throw new Error("Offline");
    const result = savedResults.get(attemptId);
    return result ? { ...result } : null;
  },
};
