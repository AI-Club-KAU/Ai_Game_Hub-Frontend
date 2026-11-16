export const LEADERBOARD_GAME_IDS = ["1", "2", "3", "4", "5"] as const;
export type LeaderboardGameId = typeof LEADERBOARD_GAME_IDS[number];
export type GameLeaderboardEntry = { rank: number; displayName: string; score: number };
export type GameLeaderboardSnapshot = { gameId: LeaderboardGameId; maxScore: 100; entries: GameLeaderboardEntry[]; updatedAt: string };
export interface GameLeaderboardService {
  availability: "available" | "awaiting-deployment";
  load(gameId: LeaderboardGameId): Promise<GameLeaderboardSnapshot>;
}
export function isLeaderboardGameId(value: unknown): value is LeaderboardGameId {
  return typeof value === "string" && (LEADERBOARD_GAME_IDS as readonly string[]).includes(value);
}
