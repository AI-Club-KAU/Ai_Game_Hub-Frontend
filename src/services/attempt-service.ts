import type { BoothSection, EventDay } from "./eligibility-service";
/** Frontend draft only. Mada owns the final Start/session contract. */
export type GameAttempt = { id: string; participantIdentifier: string; gameId: string; gameTitle: string; day: EventDay; section: BoothSection; status: "active" };
export type StartRequest = { requestId: string; participantIdentifier: string; gameId: string; day: EventDay; section: BoothSection };
export type StartResult = { status: "started"; attempt: GameAttempt } | { status: "rejected"; message: string };
export interface AttemptService {
  start(request: StartRequest): Promise<StartResult>;
  inspect(participantIdentifier: string): Promise<GameAttempt | null>;
}
