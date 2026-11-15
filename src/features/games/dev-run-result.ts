const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, fields: string[]) => Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));
const integer = (value: unknown, max: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;

/** Session/source/first-result ownership stays in GameContainer; no iframe identity is trusted. */
export function devRunScore(data: unknown, nonce: string): number | null {
  if (!record(data) || !keys(data, ["type", "version", "game", "nonce", "score", "maxScore", "stats", "breakdown"]) ||
      data.type !== "DEV_RUN_FINAL_SCORE" || data.version !== 1 || data.game !== "dev-run" || data.nonce !== nonce ||
      data.maxScore !== 100 || !integer(data.score, 100) || !record(data.stats) || !record(data.breakdown)) return null;
  const s = data.stats, b = data.breakdown;
  if (!keys(s, ["collected", "correct", "collisions", "finished"]) ||
      !integer(s.collected, 30) || !integer(s.correct, 10) || !integer(s.collisions, 3) || typeof s.finished !== "boolean" ||
      (s.finished && s.collisions === 3) ||
      !keys(b, ["collectibles", "quiz", "noCollision", "completion", "total"])) return null;
  // Match ScoreManager.compute exactly, including its flooring expression.
  const collectibles = Math.floor(s.collected / 30 * 30), quiz = s.correct * 5;
  const noCollision = s.finished && s.collisions === 0 ? 10 : 0, completion = s.finished ? 10 : 0;
  const total = Math.min(100, collectibles + quiz + noCollision + completion);
  return b.collectibles === collectibles && b.quiz === quiz && b.noCollision === noCollision &&
    b.completion === completion && b.total === total && data.score === total ? total : null;
}
