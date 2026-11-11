import { test, expect } from "@playwright/test";
import { mockAttemptService, attemptDemo } from "../src/services/mock-attempt-service";
import { eligibilityDemo } from "../src/services/mock-eligibility-service";
import { activeAttempts } from "../src/services/mock-attempt-store";

test("concurrent Start calls and replay create exactly one active attempt", async () => {
  eligibilityDemo.reset(); attemptDemo.setMode("normal");
  const request = { requestId: crypto.randomUUID(), participantIdentifier: "service-atomic", gameId: "3", day: 3 as const, section: "students" as const };
  const [first, replay, competing] = await Promise.all([
    mockAttemptService.start(request), mockAttemptService.start(request),
    mockAttemptService.start({ ...request, requestId: crypto.randomUUID() }),
  ]);
  expect(first.status).toBe("started"); expect(replay).toEqual(first); expect(competing.status).toBe("rejected");
  expect(await mockAttemptService.start(request)).toEqual(first);
  expect(activeAttempts.get(request.participantIdentifier)?.id).toBe(first.status === "started" ? first.attempt.id : "");
});
test("Start rechecks stale day, section and eligibility instead of trusting selection", async () => {
  eligibilityDemo.configure({ day: 4, section: "students", history: "new", offline: false });
  const result = await mockAttemptService.start({ requestId: crypto.randomUUID(), participantIdentifier: "service-stale", gameId: "3", day: 3, section: "students" });
  expect(result.status).toBe("rejected"); expect(activeAttempts.has("service-stale")).toBe(false);
  eligibilityDemo.reset();
});
