import type { GameAttempt } from "./attempt-service";
import type { SavedResult } from "./result-service";

/** Local Mock identities only. Backend mappings require Mada's confirmation. */
export const MOCK_GAME_CATALOG = Object.freeze([
  { id: "mock", title: "ESCAPE.EXE", maxScore: 100 },
  { id: "2", title: "لعبة تجريبية 02", maxScore: 100 },
  { id: "3", title: "لعبة تجريبية 03", maxScore: 100 },
  { id: "4", title: "لعبة تجريبية 04", maxScore: 100 },
  { id: "5", title: "لعبة تجريبية 05", maxScore: 100 },
] as const);
export const MOCK_MAX_POINTS = MOCK_GAME_CATALOG.reduce((total, game) => total + game.maxScore, 0);
export const findMockGame = (id: string) => MOCK_GAME_CATALOG.find(game => game.id === id);

export class MockHistoryConflict extends Error {
  constructor(reason: string) {
    super(`تعارض في بيانات Mock: ${reason}. لم تُحذف أو تُحوّل أي بيانات. يلزم مراجعة البيانات قبل اعتماد النقاط أو متابعة اللعب.`);
    this.name = "MockHistoryConflict";
  }
}

/** Validate without mutating or filtering away historical records. */
export function assertMockHistory(results: readonly SavedResult[], attempts: readonly GameAttempt[], identifier?: string) {
  const completed = new Set<string>(), unfinished = new Set<string>(), attemptIds = new Set<string>();
  for (const result of results) {
    if (identifier !== undefined && result.participantIdentifier !== identifier) continue;
    const game = findMockGame(result.gameId);
    if (!game) throw new MockHistoryConflict(`نتيجة محفوظة للعبة خارج الكتالوج (${result.gameId})`);
    if (!Number.isInteger(result.score) || result.score < 0 || result.score > game.maxScore) throw new MockHistoryConflict("درجة محفوظة غير صالحة");
    const key = JSON.stringify([result.participantIdentifier, result.gameId]);
    if (completed.has(key) || attemptIds.has(result.attemptId)) throw new MockHistoryConflict("نتائج مكتملة مكررة لنفس اللعبة أو المحاولة");
    completed.add(key); attemptIds.add(result.attemptId);
  }
  for (const attempt of attempts) {
    if (identifier !== undefined && attempt.participantIdentifier !== identifier) continue;
    if (!findMockGame(attempt.gameId)) throw new MockHistoryConflict(`محاولة غير مكتملة للعبة خارج الكتالوج (${attempt.gameId})`);
    const key = JSON.stringify([attempt.participantIdentifier, attempt.gameId]);
    if (completed.has(key) || unfinished.has(key) || attemptIds.has(attempt.id)) throw new MockHistoryConflict("محاولات متعارضة أو مكررة لنفس اللعبة");
    unfinished.add(key); attemptIds.add(attempt.id);
  }
}
