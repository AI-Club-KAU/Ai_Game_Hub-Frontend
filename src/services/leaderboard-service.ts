
/** UI needs only. Backend owns ranking, display names and tie policy. */
export type LeaderboardEntry = { rank: number; displayName: string; totalScore: number; gamesCompleted: number };
export type LeaderboardSnapshot = { entries: LeaderboardEntry[]; updatedAt: string };
export interface LeaderboardService { load(): Promise<LeaderboardSnapshot> }
