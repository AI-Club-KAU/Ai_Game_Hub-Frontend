import { activeAttempts } from "./mock-attempt-store";
import type { ResultService, SavedResult } from "./result-service";
import { assertMockHistory, findMockGame, MockHistoryConflict } from "./mock-game-catalog";
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
    const attempt = activeAttempts.get(request.attemptId);
    const identifier = existing?.participantIdentifier ?? attempt?.participantIdentifier;
    if (identifier !== undefined) {
      try { assertMockHistory([...savedResults.values()], [...activeAttempts.values()], identifier); }
      catch (error) { if (error instanceof MockHistoryConflict) return { status: "rejected", message: error.message }; throw error; }
    }
    if (existing) return existing.score === request.score ? { status: "saved", result: { ...existing } } : { status: "rejected", message: "توجد نتيجة مختلفة محفوظة لهذه المحاولة؛ تحقق من حالة الحفظ." };
    if (!attempt || !Number.isInteger(request.score) || request.score < 0 || request.score > findMockGame(attempt.gameId)!.maxScore || scenario === "rejected") return { status: "rejected", message: "لم تعتمد الخدمة النتيجة. أعد الجهاز إلى عضو النادي للتحقق." };
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
    const identifier = result?.participantIdentifier ?? activeAttempts.get(attemptId)?.participantIdentifier;
    if (identifier !== undefined) assertMockHistory([...savedResults.values()], [...activeAttempts.values()], identifier);
    return result ? { ...result } : null;
  },
};
