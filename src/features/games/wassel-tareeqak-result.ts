const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const count = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 33;

/** The host separately owns source, opaque origin, active attempt and first-result locking. */
export function wasselTareeqakScore(data: unknown, nonce: string): number | null {
  const fields = ["type", "version", "game", "nonce", "score", "maxScore", "rawElapsedTime", "correct", "wrong", "reached", "reason"];
  if (!record(data) || Object.keys(data).length !== fields.length || !fields.every(k => Object.hasOwn(data, k)) ||
      data.type !== "wassel-tareeqak:result" || data.version !== 1 || data.game !== "wassel-tareeqak" || data.nonce !== nonce ||
      data.maxScore !== 100 || typeof data.score !== "number" || !Number.isInteger(data.score) || data.score < 0 || data.score > 100 ||
      typeof data.rawElapsedTime !== "number" || !Number.isFinite(data.rawElapsedTime) || data.rawElapsedTime < 0 || data.rawElapsedTime > 120 ||
      !count(data.correct) || !count(data.wrong) || data.correct + data.wrong > 33 || typeof data.reached !== "boolean") return null;
  if (data.reached ? data.reason !== "win" || data.correct < 7 :
      (data.reason !== "timeout" && data.reason !== "blocked")) return null;
  if (data.reason === "timeout" && data.rawElapsedTime !== 120) return null;
  if (data.reason === "blocked" && data.wrong === 0) return null;
  const base = Math.min(70, data.correct * 10);
  const expected = data.reached ? Math.floor(base + 10 + Math.max(0, Math.min(20, (120 - data.rawElapsedTime) / 4))) : base;
  return data.score === expected ? expected : null;
}
