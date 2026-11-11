import type { GameAttempt } from "./attempt-service";
/** In-memory fixture state, intentionally lost on page reload. No result or completion writes. */
export const activeAttempts = new Map<string, GameAttempt>();
export function activeAttemptFor(identifier: string) { return activeAttempts.get(identifier); }
