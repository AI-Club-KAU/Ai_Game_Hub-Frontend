import type { GameAttempt } from "./attempt-service";
/** Memory-only attempts indexed by attempt ID, including multiple games for one participant. */
export const activeAttempts = new Map<string, GameAttempt>();
export function activeAttemptsFor(identifier: string) {
  return [...activeAttempts.values()].filter(attempt => attempt.participantIdentifier === identifier);
}
export function activeAttemptFor(identifier: string) { return activeAttemptsFor(identifier)[0]; }
