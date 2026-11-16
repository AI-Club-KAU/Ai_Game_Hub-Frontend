import { findMockGame } from "@/services/mock-game-catalog";

type GameAsset = { game: "escape-exe" | "dev-run" | "wassel-tareeqak" | "qa"; entry: string; readiness: "container-check-v0" | "load" };
const escapeExe: GameAsset = Object.freeze({ game: "escape-exe", entry: "/games/escape-exe/index.html", readiness: "load" });
const devRun: GameAsset = Object.freeze({ game: "dev-run", entry: "/games/dev-run/index.html", readiness: "load" });
const wassel: GameAsset = Object.freeze({ game: "wassel-tareeqak", entry: "/games/wassel-tareeqak/index.html", readiness: "load" });
const qa: GameAsset = Object.freeze({ game: "qa", entry: "/games/container-check/index.html", readiness: "container-check-v0" });

/** `mock` is a local game ID, never a numeric Backend game mapping. */
export function getGameAsset(gameId: string, mockMode: boolean): GameAsset | null {
  // Live approvals are explicit. Numeric IDs alone never enable a placeholder.
  if (!mockMode) return gameId === "1" ? escapeExe : gameId === "2" ? devRun : gameId === "3" ? wassel : null;
  if (!findMockGame(gameId)) return null;
  return gameId === "mock" ? escapeExe : qa;
}

/** Live approvals: ESCAPE.EXE (1), Dev Run (2), Wassel (3); never QA placeholders. */
export function canLaunchGame(gameId: string, mockMode: boolean) {
  return getGameAsset(gameId, mockMode) !== null;
}
