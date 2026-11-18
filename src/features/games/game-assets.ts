import { findMockGame } from "@/services/mock-game-catalog";

type GameAsset = { game: "escape-exe" | "dev-run" | "wassel-tareeqak" | "spot-the-ai" | "qa"; entry: string; readiness: "container-check-v0" | "load" };
const escapeExe: GameAsset = Object.freeze({ game: "escape-exe", entry: "/games/escape-exe/index.html", readiness: "load" });
const devRun: GameAsset = Object.freeze({ game: "dev-run", entry: "/games/dev-run/index.html", readiness: "load" });
const wassel: GameAsset = Object.freeze({ game: "wassel-tareeqak", entry: "/games/wassel-tareeqak/index.html", readiness: "load" });
const qa: GameAsset = Object.freeze({ game: "qa", entry: "/games/container-check/index.html", readiness: "container-check-v0" });
const spotTheAi: GameAsset = Object.freeze({ game: "spot-the-ai", entry: "/games/spot-the-ai/index.html", readiness: "load" });

/** `mock` is a local game ID, never a numeric Backend game mapping. */
export function getGameAsset(gameId: string, mockMode: boolean): GameAsset | null {
  // Live approvals are explicit. Numeric IDs alone never enable a placeholder.
  if (!mockMode) return gameId === "1" ? escapeExe : gameId === "2" ? devRun : gameId === "3" ? wassel : gameId === "5" ? spotTheAi : null;
  if (!findMockGame(gameId)) return null;
  return gameId === "mock" ? escapeExe : qa;
}

/** Explicit Live approvals: 1, 2, 3, 5; never QA placeholders or Game 4. */
export function canLaunchGame(gameId: string, mockMode: boolean) {
  return getGameAsset(gameId, mockMode) !== null;
}
