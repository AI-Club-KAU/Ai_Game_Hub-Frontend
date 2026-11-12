// Replace this adapter when Mada provides the real access/session contract.
export { mockAccessService as accessService } from "./mock-access-service";
export { mockParticipantService as participantService, participantDemo } from "./mock-participant-service";

export { mockEligibilityService as eligibilityService, eligibilityDemo } from "./mock-eligibility-service";

export { mockAttemptService as attemptService, attemptDemo } from "./mock-attempt-service";
export { mockResultService as resultService, resultDemo } from "./mock-result-service";

export { mockLeaderboardService as leaderboardService, leaderboardDemo } from "./mock-leaderboard-service";
