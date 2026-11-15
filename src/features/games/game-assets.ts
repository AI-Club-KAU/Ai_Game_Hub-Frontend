import { findMockGame } from "@/services/mock-game-catalog";

type GameAsset = { game: "escape-exe" | "qa"; entry: string; readiness: "container-check-v0" | "load" };
const escapeExe: GameAsset = Object.freeze({ game: "escape-exe", entry: "/games/escape-exe/index.html", readiness: "load" });
const qa: GameAsset = Object.freeze({ game: "qa", entry: "/games/container-check/index.html", readiness: "container-check-v0" });

/** `mock` is a local game ID, never a numeric Backend game mapping. */
export function getGameAsset(gameId: string, mockMode: boolean): GameAsset | null {
  // Live approvals are explicit. Numeric IDs alone never enable a placeholder.
  if (!mockMode) return gameId === "1" ? escapeExe : null;
  if (!findMockGame(gameId)) return null;
  return gameId === "mock" ? escapeExe : qa;
}

/** Only ESCAPE.EXE (Backend ID 1) is approved for Live. */
export function canLaunchGame(gameId: string, mockMode: boolean) {
  return getGameAsset(gameId, mockMode) !== null;
}
