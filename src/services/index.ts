
import { isMock, apiBaseUrl, configurationError } from "./runtime-config";
import { platformSession } from "./platform-session";
import { createBackendServices } from "./backend-services";
import { mockAccessService } from "./mock-access-service";
import { mockParticipantService } from "./mock-participant-service";
import { mockEligibilityService } from "./mock-eligibility-service";
import { mockAttemptService } from "./mock-attempt-service";
import { mockResultService } from "./mock-result-service";
import { mockLeaderboardService } from "./mock-leaderboard-service";
// Invalid configuration has no API client, and every service fails before transport.
const unavailable = async (): Promise<never> => { throw configurationError; };
const backend: ReturnType<typeof createBackendServices> = apiBaseUrl ? createBackendServices(apiBaseUrl) : {
  access: { verify: unavailable }, participant: { register: unavailable, find: unavailable },
  eligibility: { load: unavailable }, attempts: { start: unavailable, inspect: unavailable, listActive: unavailable },
  results: { save: unavailable, inspect: unavailable }, leaderboard: { load: unavailable }, clear: () => platformSession.clear(),
};
export { isMock, configurationError };
export const accessService = isMock ? mockAccessService : backend.access;
export const participantService = isMock ? mockParticipantService : backend.participant;
export const eligibilityService = isMock ? mockEligibilityService : backend.eligibility;
export const attemptService = isMock ? mockAttemptService : backend.attempts;
export const resultService = isMock ? mockResultService : backend.results;
export const leaderboardService = isMock ? mockLeaderboardService : backend.leaderboard;
export const clearBackendSession = backend.clear;
export { participantDemo } from "./mock-participant-service";
export { eligibilityDemo } from "./mock-eligibility-service";
export { attemptDemo } from "./mock-attempt-service";
export { resultDemo } from "./mock-result-service";
export { leaderboardDemo } from "./mock-leaderboard-service";
