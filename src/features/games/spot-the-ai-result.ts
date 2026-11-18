const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, fields: string[]) => Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));
const integer = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const answers = ["right", "left", "right", "right", "left", "left", "right", "left"];

/** Port/session ownership and synchronous first-result locking remain in GameContainer. */
export function spotTheAiScore(data: unknown, nonce: string): number | null {
  if (!nonce || !record(data) || !keys(data, ["type", "version", "game", "nonce", "score", "maxScore", "rawScore", "rounds"]) ||
      data.type !== "spot-the-ai:result" || data.version !== 1 || data.game !== "spot-the-ai" || data.nonce !== nonce ||
      data.maxScore !== 100 || !integer(data.score, 0, 100) || typeof data.rawScore !== "number" ||
      !Number.isFinite(data.rawScore) || data.rawScore < 0 || data.rawScore > 100 || !Array.isArray(data.rounds) || data.rounds.length !== 8) return null;
  const seen = new Set<number>();
  let raw = 0;
  for (const round of data.rounds) {
    if (!record(round) || !keys(round, ["id", "side", "timeLeft"]) || !integer(round.id, 1, 8) || seen.has(round.id) ||
        !integer(round.timeLeft, 0, 15) || ![null, "left", "right"].includes(round.side as null | string) ||
        (round.side === null ? round.timeLeft !== 0 : round.timeLeft === 0)) return null;
    seen.add(round.id);
    if (round.side === answers[round.id - 1]) raw += 10 + Math.max(round.timeLeft, 0) / 15 * 2.5;
  }
  // Preserve accumulation order and original formula. Round the final total once only.
  return raw === data.rawScore && Math.round(raw) === data.score ? data.score : null;
}
