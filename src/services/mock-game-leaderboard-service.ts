import { leaderboardDemo } from "./mock-leaderboard-service";
import { isLeaderboardGameId, type GameLeaderboardService } from "./game-leaderboard-service";

/** Independent, explicitly labeled UI samples. Never reinterpret saved QA scores as real games. */
export const mockGameLeaderboardService: GameLeaderboardService = {
  availability: "available",
  async load(gameId) {
    if (!isLeaderboardGameId(gameId)) throw new Error("Invalid game ID");
    const scenario = leaderboardDemo.getMode();
    await new Promise(resolve => setTimeout(resolve, 650));
    if (scenario === "offline") throw new Error("Game leaderboard unavailable");
    const entries = scenario === "sample" ? [100, 100, 90, 80, 70, 60, 50, 40, 20, 0].map((score, i) => ({
      rank: i + 1, displayName: `مشارك تجريبي ${i + 1}`, score,
    })) : [];
    return { gameId, maxScore: 100, entries, updatedAt: new Date().toISOString() };
  },
};
