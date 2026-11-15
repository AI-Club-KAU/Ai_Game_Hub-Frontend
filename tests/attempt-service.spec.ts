import { test, expect } from "@playwright/test";
import { mockAttemptService, attemptDemo } from "../src/services/mock-attempt-service";
import { eligibilityDemo } from "../src/services/mock-eligibility-service";
import { activeAttempts } from "../src/services/mock-attempt-store";
import { MOCK_GAME_CATALOG } from "../src/services/mock-game-catalog";

test("concurrent Start calls and replay create exactly one active attempt", async () => {
  eligibilityDemo.reset(); attemptDemo.setMode("normal");
  const request = { requestId: crypto.randomUUID(), participantIdentifier: "service-atomic", gameId: "3", day: 3 as const, section: "students" as const };
  const [first, replay, competing] = await Promise.all([
    mockAttemptService.start(request), mockAttemptService.start(request),
    mockAttemptService.start({ ...request, requestId: crypto.randomUUID() }),
  ]);
  expect(first.status).toBe("started"); expect(replay).toEqual(first); expect(competing.status).toBe("rejected");
  expect(await mockAttemptService.start(request)).toEqual(first);
  expect([...activeAttempts.values()].filter(a => a.participantIdentifier === request.participantIdentifier)).toHaveLength(1);
});
test("Start rechecks per-game eligibility instead of trusting selection", async () => {
  eligibilityDemo.configure({ day: 4, section: "students", history: "complete", offline: false });
  const result = await mockAttemptService.start({ requestId: crypto.randomUUID(), participantIdentifier: "service-stale", gameId: "3", day: 3, section: "students" });
  expect(result.status).toBe("rejected"); expect(activeAttempts.has("service-stale")).toBe(false);
  eligibilityDemo.reset();
});

test("five games can finish on the same day, each only once, total 500",async()=>{
 const {mockResultService,resultDemo}=await import("../src/services/mock-result-service");
 const {mockEligibilityService}=await import("../src/services/mock-eligibility-service");
 eligibilityDemo.reset();attemptDemo.setMode("normal");resultDemo.reset();
 const identifier="all-five-same-day";
 for(const game of MOCK_GAME_CATALOG){
   const request={requestId:crypto.randomUUID(),participantIdentifier:identifier,gameId:game.id,day:3 as const,section:"students" as const};
   const started=await mockAttemptService.start(request);
   expect(started.status).toBe("started");
   if(started.status!=="started")throw new Error("Start failed");
   expect((await mockResultService.save({attemptId:started.attempt.id,score:100})).status).toBe("saved");
   expect((await mockAttemptService.start({...request,requestId:crypto.randomUUID()})).status).toBe("rejected");
 }
 const data=await mockEligibilityService.load(identifier);
 expect(data.totalScore).toBe(500);expect(data.results).toHaveLength(5);
 expect(data.games.every(game=>!game.eligible)).toBe(true);
});
