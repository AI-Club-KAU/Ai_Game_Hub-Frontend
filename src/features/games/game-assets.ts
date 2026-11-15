import { findMockGame } from "@/services/mock-game-catalog";

type GameAsset = { entry: string; readiness: "container-check-v0" | "load" };

/** `mock` is a local game ID, never a numeric Backend game mapping. */
export function getGameAsset(gameId: string): GameAsset | null {
  if (!findMockGame(gameId)) return null;
  return gameId === "mock" ? { entry: "/games/escape-exe/index.html", readiness: "load" }
    : { entry: "/games/container-check/index.html", readiness: "container-check-v0" };
}

/** No local asset is approved for live attempts in Phase 1. */
export function canLaunchGame(gameId: string, mockMode: boolean) {
  return mockMode && getGameAsset(gameId) !== null;
}
