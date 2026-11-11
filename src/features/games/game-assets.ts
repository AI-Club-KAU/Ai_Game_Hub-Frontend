/** Temporary local fixture for container QA. Replace per game after departments deliver assets. */
export function getGameAsset(gameId: string) {
  if (!["1", "2", "3", "4", "5"].includes(gameId)) throw new Error("Unknown game asset");
  return { entry: "/games/container-check/index.html", readiness: "container-check-v0" as const };
}
