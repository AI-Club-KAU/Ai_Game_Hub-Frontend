/** UI models, not a final Backend API contract. Eligibility must be authoritative on the server. */
export type BoothSection = "students" | "female-students";
export type EventDay = 1 | 2 | 3 | 4 | 5;
export type GameAvailability = {
  id: string; title: string; maxScore: number; eligible: boolean; reason: string;
};
export type ApprovedResult = { gameId: string; gameTitle: string; day: EventDay | string; score: number };
export type EligibilitySnapshot = {
  participantIdentifier: string;
  section: BoothSection | null;
  day: EventDay | string;
  status: "eligible" | "blocked";
  message: string;
  games: GameAvailability[];
  results: ApprovedResult[];
  totalScore: number;
};
export interface EligibilityService {
  load(participantIdentifier: string): Promise<EligibilitySnapshot>;
}
