import type { AttemptService, GameAttempt, StartRequest, StartResult } from "./attempt-service";
import { activeAttempts, activeAttemptFor, activeAttemptsFor } from "./mock-attempt-store";
import { mockEligibilityService } from "./mock-eligibility-service";
import { savedResults } from "./mock-result-service";
import { assertMockHistory, findMockGame, MockHistoryConflict } from "./mock-game-catalog";
export type StartDemoMode = "normal" | "offline" | "lost-response" | "rejected";
let mode: StartDemoMode = "normal";
const completedRequests = new Map<string, { request: StartRequest; attempt: GameAttempt }>();
const pendingRequests = new Map<string, { request: StartRequest; promise: Promise<StartResult> }>();
const busyParticipants = new Set<string>();
const sameRequest = (a: StartRequest, b: StartRequest) => a.participantIdentifier === b.participantIdentifier && a.gameId === b.gameId && a.day === b.day && a.section === b.section;
export const attemptDemo = { setMode(value: StartDemoMode) { mode = value; }, getMode: () => mode };
const rejected = (message: string): StartResult => ({ status: "rejected", message });
export const mockAttemptService: AttemptService = {
  async inspect(identifier) {
    await new Promise(resolve => setTimeout(resolve, 350));
    if (mode === "offline") throw new Error("Mock connection unavailable");
    assertMockHistory([...savedResults.values()], [...activeAttempts.values()], identifier);
    const attempt = activeAttemptFor(identifier);
    return attempt ? { ...attempt } : null;
  },
  async listActive(identifier) {
    await new Promise(resolve => setTimeout(resolve, 350));
    if (mode === "offline") throw new Error("Mock connection unavailable");
    assertMockHistory([...savedResults.values()], [...activeAttempts.values()], identifier);
    return activeAttemptsFor(identifier).map(attempt => ({ ...attempt }));
  },
  start(request) {
    try { assertMockHistory([...savedResults.values()], [...activeAttempts.values()], request.participantIdentifier); }
    catch (error) { if (error instanceof MockHistoryConflict) return Promise.resolve(rejected(error.message)); throw error; }
    if (!findMockGame(request.gameId)) return Promise.resolve(rejected("اللعبة غير موجودة في كتالوج Mock المعتمد."));
    const saved = completedRequests.get(request.requestId);
    if (saved && !activeAttempts.has(saved.attempt.id)) return Promise.resolve(rejected("انتهت هذه المحاولة؛ حدّث حالة المشارك."));
    if (saved) return Promise.resolve(sameRequest(saved.request, request) ? { status: "started", attempt: { ...saved.attempt } } : rejected("معرّف الطلب مستخدم لاختيار آخر. حدّث الحالة."));
    const pending = pendingRequests.get(request.requestId);
    if (pending) return sameRequest(pending.request, request) ? pending.promise : Promise.resolve(rejected("طلب آخر يستخدم نفس المعرّف."));
    if (busyParticipants.has(request.participantIdentifier)) return Promise.resolve(rejected("يوجد طلب بدء قيد التحقق لهذا المشارك."));
    busyParticipants.add(request.participantIdentifier);
    const currentMode = mode;
    const promise = (async (): Promise<StartResult> => {
      try {
        await new Promise(resolve => setTimeout(resolve, 450));
        if (currentMode === "offline") throw new Error("Mock offline before start");
        if (currentMode === "rejected") return rejected("لم تعتمد الخدمة بدء المحاولة. حدّث الأهلية ثم أعد الاختيار.");
        if (activeAttemptsFor(request.participantIdentifier).some(attempt => attempt.gameId === request.gameId)) return rejected("توجد محاولة نشطة لهذا المشارك. تحقّق من حالتها لاستئنافها.");
        const eligibility = await mockEligibilityService.load(request.participantIdentifier);
        const game = eligibility.games.find(item => item.id === request.gameId && item.eligible);
        if (!game) return rejected("تغيّرت أهلية اللعبة. حدّث الحالة واختر لعبة مسموحة.");
        const attempt: GameAttempt = { id: crypto.randomUUID(), participantIdentifier: request.participantIdentifier, gameId: game.id, gameTitle: game.title, day: eligibility.day, section: eligibility.section, status: "active" };
        activeAttempts.set(attempt.id, attempt);
        completedRequests.set(request.requestId, { request: { ...request }, attempt });
        if (currentMode === "lost-response") throw new Error("Mock response lost after reservation");
        return { status: "started", attempt: { ...attempt } };
      } finally { busyParticipants.delete(request.participantIdentifier); pendingRequests.delete(request.requestId); }
    })();
    pendingRequests.set(request.requestId, { request: { ...request }, promise });
    return promise;
  },
};
