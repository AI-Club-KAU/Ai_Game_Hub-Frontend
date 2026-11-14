
import {test,expect} from "@playwright/test";
import {createBackendServices} from "../src/services/backend-services";
import {platformSession} from "../src/services/platform-session";
const sid="00000000-0000-0000-0000-000000000001";
function fixture() {
 const calls:{path:string;body:any;auth:string|null}[]=[];
 let attempts:any[]=[]; let failFinish=false; let outage=false; let totalUnavailable=false; let conflict=false;
 const transport:typeof fetch=async (input,init)=>{
  const path=new URL(String(input)).pathname; const body=init?.body?JSON.parse(String(init.body)):undefined;
  calls.push({path,body,auth:new Headers(init?.headers).get("Authorization")});
  const json=(data:any,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json"}});
  if(path==="/access/verify")return json({access_token:"test-token",token_type:"Bearer",expires_in:3600});
  if(path==="/students/login" || path==="/students/register")return json({student:{id:sid,student_number:"00123",full_name:"مشارك الاختبار"}});
  if(path.endsWith("/progress")) {
   if(outage)throw new Error("network");
   return json({student_id:sid,play_date:"2026-11-12",total_score:attempts.reduce((sum,a)=>sum+(a.score??0),0),games:[1,2,3,4,5].map(id=>({id,name:"لعبة "+id,max_score:100,is_active:true,attempt:attempts.find(a=>a.game_id===id)??null,eligible_to_start:!attempts.some(a=>a.game_id===id)}))});
  }
  if(path==="/attempts/start"){const a={id:"attempt-"+body.game_id,student_id:sid,game_id:body.game_id,status:"started",score:null,play_date:"2026-11-12",started_at:"2026-11-12T10:00:00Z"};attempts.push(a);return json({attempt:a},201);}
  if(path==="/attempts/finish"){
   const a=attempts.find(a=>a.id===body.attempt_id);
   a.status="completed";a.score=body.score;
   if(failFinish)throw new Error("lost response");
   if(conflict)return json({error:{code:"attempt_already_completed"}},409);
   return json({attempt:a,score_saved:true,total_available:!totalUnavailable,total_score:totalUnavailable?null:a.score});
  }
  if(path==="/leaderboard")return json({leaderboard:[{full_name:"مشارك الاختبار",total_score:80,games_completed:1}]});
  throw new Error("Unexpected route");
 };
 const api=createBackendServices("https://api.test",transport);
 return {api,calls,setLost:()=>{failFinish=true;},setOutage:()=>{outage=true;},setDegraded:()=>{totalUnavailable=true;},setConflict:()=>{conflict=true;}};
}
async function start(f:ReturnType<typeof fixture>,gameId="1"){
 await f.api.access.verify("operator-code");await f.api.participant.find("00123");
 return f.api.attempts.start({requestId:"local-only",participantIdentifier:"00123",gameId,day:"2026-11-12",section:null});
}
test.afterEach(()=>platformSession.clear());
test("real adapter preserves UUID/leading zeros, sends exact wire fields and uses bearer only",async()=>{
 const f=fixture();const result=await start(f);
 expect(result.status).toBe("started");
 expect(f.calls.find(c=>c.path==="/students/login")?.body).toEqual({student_number:"00123"});
 expect(f.calls.find(c=>c.path==="/attempts/start")?.body).toEqual({student_id:sid,game_id:1});
 expect(f.calls.filter(c=>c.path!=="/access/verify").every(c=>c.auth==="Bearer test-token")).toBe(true);
 const data=await f.api.eligibility.load("00123");expect(data.day).toBe("2026-11-12");expect(data.section).toBeNull();
});
test("lost finish response reconciles saved score without duplicate writes",async()=>{
 const f=fixture();await start(f);f.setLost();
 await expect(f.api.results.save({attemptId:"attempt-1",score:80})).rejects.toThrow();
 expect((await f.api.results.save({attemptId:"attempt-1",score:80})).status).toBe("saved");
 expect(f.calls.filter(c=>c.path==="/attempts/finish")).toHaveLength(1);
});
test("saved score is confirmed even if total is unavailable; fractions never submitted",async()=>{
 const f=fixture();await start(f);f.setDegraded();
 expect((await f.api.results.save({attemptId:"attempt-1",score:1.5})).status).toBe("rejected");
 const result=await f.api.results.save({attemptId:"attempt-1",score:80});
 expect(result.status==="saved"&&result.result.score).toBe(80);
 expect(f.calls.filter(c=>c.path==="/attempts/finish")).toHaveLength(1);
});
test("409 completed response is reconciled; progress outage prevents blind writes",async()=>{
 const f=fixture();await start(f);f.setConflict();
 expect((await f.api.results.save({attemptId:"attempt-1",score:80})).status).toBe("saved");
 const g=fixture();await start(g);g.setOutage();
 await expect(g.api.results.save({attemptId:"attempt-1",score:80})).rejects.toThrow();
 expect(g.calls.filter(c=>c.path==="/attempts/finish")).toHaveLength(0);
});
test("all unfinished attempts can be restored and leaderboard preserves server order",async()=>{
 const f=fixture();await start(f);await f.api.attempts.start({requestId:"second",participantIdentifier:"00123",gameId:"2",day:"2026-11-13",section:null});
 expect(await f.api.attempts.listActive!("00123")).toHaveLength(2);
 expect((await f.api.leaderboard.load()).entries).toEqual([{rank:1,displayName:"مشارك الاختبار",totalScore:80,gamesCompleted:1}]);
 f.api.clear();expect(platformSession.getToken()).toBeNull();
});

test("expired authentication before finish renews in place and retains exact attempt",async()=>{
 const {createApiClient}=await import("../src/services/backend-client");
 const sent:any[]=[];let n=0;
 const client=createApiClient("https://api.test",async(_url,init)=>{
  sent.push({body:JSON.parse(String(init?.body)),auth:new Headers(init?.headers).get("Authorization")});
  return new Response(JSON.stringify(n++===0?{error:{code:"invalid_platform_token"}}:{score_saved:true}),{status:n===1?401:200});
 });
 platformSession.accept("expired-at-server",3600);
 const stop=platformSession.subscribe(()=>{if(platformSession.needsRenewal())platformSession.accept("renewed-token",3600);});
 try {
  const result=await client<{score_saved:boolean}>("/attempts/finish",{attempt_id:"same-attempt",score:80});
  expect(result.score_saved).toBe(true);
  expect(sent.map(s=>s.body)).toEqual([{attempt_id:"same-attempt",score:80},{attempt_id:"same-attempt",score:80}]);
  expect(sent.map(s=>s.auth)).toEqual(["Bearer expired-at-server","Bearer renewed-token"]);
 }finally{stop();}
});
test("ambiguous Start network failure is never automatically retried",async()=>{
 const {createApiClient}=await import("../src/services/backend-client");let writes=0;
 platformSession.accept("test",3600);
 const client=createApiClient("https://api.test",async()=>{writes++;throw new Error("response lost");});
 await expect(client("/attempts/start",{student_id:sid,game_id:1})).rejects.toThrow();
 expect(writes).toBe(1);
});

test("completion today only disables the completed game and keeps authoritative eligibility",async()=>{
 const f=fixture();await start(f);await f.api.results.save({attemptId:"attempt-1",score:80});
 const progress=await f.api.eligibility.load("00123");
 expect(progress.status).toBe("eligible");
 expect(progress.games.map(g=>g.eligible)).toEqual([false,true,true,true,true]);
 expect(progress.message).not.toContain("فرصة اليوم");
 expect(progress.games[1].reason).toBe("متاحة وفق الخدمة.");
 expect(progress.results[0].score).toBe(80);
});
test("eligible_to_start remains authoritative even for an active game without a previous attempt",async()=>{
 platformSession.accept("test",3600);
 const api=createBackendServices("https://api.test",async(input)=>{
  const data=String(input).endsWith("/students/login")?{student:{id:sid,student_number:"00123",full_name:"Test"}}:
  {student_id:sid,play_date:"2026-11-14",daily_slot_consumed:true,total_score:0,games:[1,2].map(id=>({id,name:"Game "+id,max_score:100,is_active:true,attempt:null,eligible_to_start:id===2}))};
  return new Response(JSON.stringify(data));
 });
 await api.participant.find("00123");
 const data=await api.eligibility.load("00123");
 expect(data.games.map(g=>g.eligible)).toEqual([false,true]);
 expect(data.games[0].reason).toContain("غير متاحة");
 expect(data.status).toBe("eligible");
});
