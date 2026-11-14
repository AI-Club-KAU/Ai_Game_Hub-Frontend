const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown, max: number): value is number => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= max;

/** Validate the delivered game's complete result; never obtain an attempt ID here. */
export function escapeExeScore(data: unknown, nonce: string): number | null {
  if (!record(data) || data.type !== "robomaze:result" || data.nonce !== nonce || !record(data.payload)) return null;
  const p = data.payload;
  if (p.game !== "escape-exe" || p.maxScore !== 100 || !integer(p.finalScore, 100) ||
      !integer(p.correctAnswers, 10) || !integer(p.questionsAnswered, 10) ||
      p.finalScore !== p.correctAnswers * 10 || p.correctAnswers > p.questionsAnswered ||
      typeof p.escaped !== "boolean" || !integer(p.timeRemaining, 180) || !integer(p.durationSeconds, 180) ||
      ![179, 180].includes(p.timeRemaining + p.durationSeconds) ||
      (!p.escaped && p.timeRemaining !== 0) || (p.escaped && p.questionsAnswered !== 10) ||
      !Array.isArray(p.answers) || p.answers.length !== 10) return null;
  let correct = 0, answered = 0;
  for (let i = 0; i < 10; i++) {
    const answer: unknown = p.answers[i];
    if (!record(answer) || answer.checkpoint !== i + 1 || typeof answer.system !== "string" ||
        !answer.system.trim() || answer.system.length > 200 ||
        typeof answer.result !== "string" || !["correct", "wrong", "unanswered"].includes(answer.result) ||
        (i < p.questionsAnswered ? answer.result === "unanswered" : answer.result !== "unanswered")) return null;
    if (answer.result === "correct") correct++;
    if (answer.result !== "unanswered") answered++;
  }
  return correct === p.correctAnswers && answered === p.questionsAnswered ? p.finalScore : null;
}
