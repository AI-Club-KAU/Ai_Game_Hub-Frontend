/** Frontend draft; not a final backend or game integration contract. */
export type ResultRequest = { attemptId: string; score: number };
export type SavedResult = ResultRequest & { participantIdentifier: string; gameId: string; gameTitle: string; day: import("./eligibility-service").EventDay };
export type SaveResult = { status: "saved"; result: SavedResult } | { status: "rejected"; message: string };
export interface ResultService {
  save(request: ResultRequest): Promise<SaveResult>;
  inspect(attemptId: string): Promise<SavedResult | null>;
}
