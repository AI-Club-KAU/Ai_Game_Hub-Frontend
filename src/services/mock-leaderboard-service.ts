
import type { LeaderboardService } from "./leaderboard-service";
import { savedResults } from "./mock-result-service";
import { mockParticipantName } from "./mock-participant-service";
type Mode = "saved" | "sample" | "empty" | "offline";
let mode: Mode = "saved";
export const leaderboardDemo = { getMode: () => mode, setMode: (value: Mode) => { mode = value; }, reset: () => { mode = "saved"; } };
export const mockLeaderboardService: LeaderboardService = {
  async load() {
    const scenario = mode;
    await new Promise(resolve => setTimeout(resolve, 650));
    if (scenario === "offline") throw new Error("Leaderboard unavailable");
    const totals = new Map<string, { displayName: string; totalScore: number; gamesCompleted: number }>();
    if (scenario === "saved") {
      for (const result of savedResults.values()) {
        const row = totals.get(result.participantIdentifier) ?? { displayName: mockParticipantName(result.participantIdentifier), totalScore: 0, gamesCompleted: 0 };
        row.totalScore += result.score; row.gamesCompleted += 1;
        totals.set(result.participantIdentifier, row);
      }
    }
    const rows = scenario === "sample" ? [
      { displayName: "مشارك تجريبي أ", totalScore: 280, gamesCompleted: 3 },
      { displayName: "مشارك تجريبي ب", totalScore: 240, gamesCompleted: 3 },
      { displayName: "مشارك تجريبي ج", totalScore: 240, gamesCompleted: 3 },
    ] : [...totals.values()];
    rows.sort((a,b) => b.totalScore - a.totalScore);
    let rank = 0;
    const entries = rows.slice(0,3).map((row,index) => {
      if (index === 0 || row.totalScore !== rows[index - 1].totalScore) rank = index + 1;
      return { rank, ...row };
    });
    return { entries, updatedAt: new Date().toISOString() };
  },
};
