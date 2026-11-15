
import {test,expect} from "./fixtures";
import {mockResultService as service,resultDemo,savedResults} from "../src/services/mock-result-service";
import {activeAttempts} from "../src/services/mock-attempt-store";
test("concurrent saves deduplicate, conflicting scores reject, invalid scores preserve attempt",async()=>{
 const attempt={id:"result-unit",participantIdentifier:"result-unit-person",gameId:"3",gameTitle:"Test",day:3 as const,section:"students" as const,status:"active" as const};
 activeAttempts.set(attempt.id,attempt); resultDemo.reset();
 expect((await service.save({attemptId:attempt.id,score:101})).status).toBe("rejected");
 expect(activeAttempts.has(attempt.id)).toBe(true);
 const request={attemptId:attempt.id,score:80};
 const results=await Promise.all([service.save(request),service.save(request)]);
 expect(results[0]).toEqual(results[1]); expect(results[0].status).toBe("saved");
 expect(activeAttempts.has(attempt.id)).toBe(false);
 expect((await service.save({...request,score:90})).status).toBe("rejected");
 expect((await service.inspect(attempt.id))?.score).toBe(80);
 expect([...savedResults.values()].filter(r=>r.attemptId===attempt.id)).toHaveLength(1);
});

test("a completed attempt cannot be relaunched by replaying its original Start request",async()=>{
 const {mockAttemptService,attemptDemo}=await import("../src/services/mock-attempt-service");
 const {eligibilityDemo}=await import("../src/services/mock-eligibility-service");
 eligibilityDemo.reset();attemptDemo.setMode("normal");resultDemo.reset();
 const request={requestId:crypto.randomUUID(),participantIdentifier:"completed-start",gameId:"3",day:3 as const,section:"students" as const};
 const started=await mockAttemptService.start(request);
 expect(started.status).toBe("started");
 if(started.status!=="started") throw new Error("Start failed");
 await service.save({attemptId:started.attempt.id,score:80});
 expect((await mockAttemptService.start(request)).status).toBe("rejected");
});
