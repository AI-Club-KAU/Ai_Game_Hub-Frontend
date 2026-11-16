import { createApiClient } from "./backend-client";
import { isLeaderboardGameId, type GameLeaderboardService, type GameLeaderboardSnapshot, type LeaderboardGameId } from "./game-leaderboard-service";

export class GameLeaderboardValidationError extends Error {
  constructor() { super("تعذّر اعتماد بيانات ترتيب اللعبة. أعد المحاولة لاحقًا."); }
}
export class GameLeaderboardUnavailableError extends Error {
  constructor() { super("ترتيب الألعاب ينتظر تأكيد نشر الخدمة."); }
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function validateGameLeaderboard(data: unknown, gameId: LeaderboardGameId): GameLeaderboardSnapshot {
  if (!isLeaderboardGameId(gameId) || !record(data) || data.game_id !== Number(gameId) || data.max_score !== 100 ||
      !Array.isArray(data.leaderboard) || data.leaderboard.length > 10) throw new GameLeaderboardValidationError();
  let previous = 100;
  const entries = data.leaderboard.map((row: unknown, index: number) => {
    if (!record(row) || typeof row.full_name !== "string" || !row.full_name.trim() ||
        typeof row.score !== "number" || !Number.isInteger(row.score) || row.score < 0 || row.score > 100 || row.score > previous) {
      throw new GameLeaderboardValidationError();
    }
    previous = row.score;
    // The approved contract defines no tie-breaker field. Preserve server ordering,
    // including any tie-break decision it has already applied; never sort by names.
    return { rank: index + 1, displayName: row.full_name, score: row.score };
  });
  return { gameId, maxScore: 100, entries, updatedAt: new Date().toISOString() };
}

/** Disabled by default. Only isolated tests opt in with an injected transport today. */
export function createBackendGameLeaderboardService(base: string, options: {
  deploymentConfirmed?: boolean; transport?: typeof fetch;
} = {}): GameLeaderboardService {
  const request = createApiClient(base, options.transport);
  return {
    availability: options.deploymentConfirmed === true ? "available" : "awaiting-deployment",
    async load(gameId) {
      if (!isLeaderboardGameId(gameId)) throw new GameLeaderboardValidationError();
      if (options.deploymentConfirmed !== true) throw new GameLeaderboardUnavailableError();
      return validateGameLeaderboard(await request<unknown>("/leaderboard/games/" + gameId), gameId);
    },
  };
}
