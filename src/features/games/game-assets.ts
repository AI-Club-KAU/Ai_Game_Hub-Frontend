type GameAsset = { entry: string; readiness: "container-check-v0" | "load" };

/** `mock` is a local scenario ID, never a numeric Backend game mapping. */
export function getGameAsset(gameId: string): GameAsset | null {
  if (gameId === "mock") return { entry: "/games/escape-exe/index.html", readiness: "load" };
  if (["1", "2", "3", "4", "5"].includes(gameId)) return { entry: "/games/container-check/index.html", readiness: "container-check-v0" };
  return null;
}

/** No local asset is approved for live attempts in Phase 1. */
export function canLaunchGame(gameId: string, mockMode: boolean) {
  return mockMode && getGameAsset(gameId) !== null;
}
