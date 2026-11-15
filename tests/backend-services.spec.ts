
import {test,expect} from "./fixtures";
import {BackendValidationError,createBackendServices} from "../src/services/backend-services";
import {platformSession} from "../src/services/platform-session";
const sid="00000000-0000-0000-0000-000000000001";
function fixture() {
 const calls:{path:string;body:any;auth:string|null}[]=[];
 let attempts:any[]=[]; let failFinish=false; let outage=false; let totalUnavailable=false; let conflict=false;
 let progressPatch=(data:any):any=>data, finishPatch=(data:any):any=>data;
 const transport:typeof fetch=async (input,init)=>{
  const path=new URL(String(input)).pathname; const body=init?.body?JSON.parse(String(init.body)):undefined;
  calls.push({path,body,auth:new Headers(init?.headers).get("Authorization")});
  const json=(data:any,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json"}});
  if(path==="/access/verify")return json({access_token:"test-token",token_type:"Bearer",expires_in:3600});
  if(path==="/students/login" || path==="/students/register")return json({student:{id:sid,student_number:"00123",full_name:"مشارك الاختبار"}});
  if(path.endsWith("/progress")) {
   if(outage)throw new Error("network");
   // Preserve non-JSON numeric faults too, to exercise the runtime validator directly.
   const data=progressPatch({student_id:sid,play_date:"2026-11-12",total_score:attempts.reduce((sum,a)=>sum+(a.score??0),0),games:[1,2,3,4,5].map(id=>({id,name:"لعبة "+id,max_score:100,is_active:true,attempt:attempts.find(a=>a.game_id===id)??null,eligible_to_start:!attempts.some(a=>a.game_id===id)}))});
   return Object.assign(json(null),{json:async()=>data});
  }
  if(path==="/attempts/start"){const a={id:"attempt-"+body.game_id,student_id:sid,game_id:body.game_id,status:"started",score:null,play_date:"2026-11-12",started_at:"2026-11-12T10:00:00Z"};attempts.push(a);return json({attempt:a},201);}
  if(path==="/attempts/finish"){
   const a=attempts.find(a=>a.id===body.attempt_id);
   a.status="completed";a.score=body.score;
   if(failFinish)throw new Error("lost response");
   if(conflict)return json({error:{code:"attempt_already_completed"}},409);
   return json(finishPatch({attempt:a,score_saved:true,total_available:!totalUnavailable,total_score:totalUnavailable?null:a.score}));
  }
  if(path==="/leaderboard")return json({leaderboard:[{full_name:"مشارك الاختبار",total_score:80,games_completed:1}]});
  throw new Error("Unexpected route");
 };
 const api=createBackendServices("https://api.test",transport);
 return {api,calls,setLost:()=>{failFinish=true;},setOutage:()=>{outage=true;},setDegraded:()=>{totalUnavailable=true;},setConflict:()=>{conflict=true;},setProgress:(patch:(data:any)=>any)=>{progressPatch=patch;},setFinish:(patch:(data:any)=>any)=>{finishPatch=patch;}};
}
async function start(f:ReturnType<typeof fixture>,gameId="1"){
 await f.api.access.verify("operator-code");await f.api.participant.find("00123");
 return f.api.attempts.start({requestId:"local-only",participantIdentifier:"00123",gameId,day:"2026-11-12",section:null});
}
test.afterEach(()=>platformSession.clear());
test("participant registration and login require an exact matching identity before caching", async () => {
 const valid = {id:sid,student_number:"00123",full_name:"Test"};
 for (const action of ["register", "find"] as const) {
  for (const student of [valid, {...valid,student_number:"123"}, {...valid,student_number:"٠٠١٢٣"}, {...valid,student_number:" 00123"},
    {...valid,student_number:undefined}, {...valid,student_number:123}, {...valid,id:"not-a-uuid"}, {...valid,id:undefined},
    {...valid,full_name:null}, {...valid,full_name:""}, undefined, null]) {
   const calls:string[]=[];
   const api=createBackendServices("https://backend.invalid",async input=>{calls.push(String(input));return new Response(JSON.stringify({student}));});
   platformSession.accept("test-token",3600);
   const operation=action==="register"?api.participant.register({identifier:"00123",fullName:"Test"}):api.participant.find("00123");
   if (student===valid) {
    expect(await operation).toEqual({status:"success",participant:{id:sid,identifier:"00123",fullName:"Test"}});
   } else {
    await expect(operation).rejects.toThrow(BackendValidationError);
    await expect(api.eligibility.load("00123")).rejects.toThrow("Retrieve participant first");
    if(typeof student?.student_number === "string") await expect(api.eligibility.load(student.student_number)).rejects.toThrow("Retrieve participant first");
    expect(calls).toHaveLength(1);
   }
  }
 }
});
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

test("progress rejects duplicate, oversized and malformed catalogs without correcting them",async()=>{
 const f=fixture();await start(f);
 const invalidIds=[undefined,null,"1","mock",0,-1,6,1.5,NaN,Infinity];
 const patches=[
  (data:any)=>({...data,games:[data.games[0],data.games[0]]}),
  (data:any)=>({...data,games:[...data.games,data.games[0]]}),
  ...invalidIds.map(id=>(data:any)=>({...data,games:[{...data.games[0],id}]})),
  ...[undefined,null,"100",99,101,NaN,Infinity].map(max_score=>(data:any)=>({...data,games:[{...data.games[0],max_score}]})),
  (data:any)=>({...data,games:[null]}),
 ];
 for(const patch of patches){f.setProgress(patch);await expect(f.api.eligibility.load("00123")).rejects.toThrow(BackendValidationError);}
 f.setProgress(data=>data);
 expect((await f.api.eligibility.load("00123")).games).toHaveLength(5);
});

test("progress validates integer totals, optional completion counts and attempt scores",async()=>{
 const f=fixture();await start(f);
 for(const total_score of [undefined,null,"80",-1,501,0.5,NaN,Infinity,-Infinity]){
  f.setProgress(data=>({...data,total_score}));
  await expect(f.api.eligibility.load("00123")).rejects.toThrow(BackendValidationError);
 }
 for(const games_completed of [undefined,null,"1",-1,6,0.5,NaN,Infinity,-Infinity]){
  f.setProgress(data=>({...data,games_completed}));
  await expect(f.api.eligibility.load("00123")).rejects.toThrow(BackendValidationError);
 }
 for(const score of [undefined,null,"80",-1,101,0.5,NaN,Infinity]){
  f.setProgress(data=>({...data,games:[{...data.games[0],attempt:{...data.games[0].attempt,status:"completed",score}}]}));
  await expect(f.api.eligibility.load("00123")).rejects.toThrow(BackendValidationError);
 }
 f.setProgress(data=>({...data,games:[{...data.games[0],attempt:{...data.games[0].attempt,score:80}}]}));
 await expect(f.api.eligibility.load("00123")).rejects.toThrow(BackendValidationError);
 for(const value of [0,5]){
  f.setProgress(data=>({...data,total_score:value*100,games_completed:value}));
  expect((await f.api.eligibility.load("00123")).totalScore).toBe(value*100);
 }
 f.setProgress(data=>data); // Existing responses without games_completed remain supported.
 expect((await f.api.eligibility.load("00123")).totalScore).toBe(0);
});

test("invalid Start IDs are rejected before any network or session activity",async()=>{
 const f=fixture();
 for(const gameId of [undefined,null,"","mock","0","-1","6","1.5","NaN","Infinity","01","1.0","1e0"," 1","1 ","1\n","1\r\n","+1","١",1,1.5,NaN,Infinity]){
  const result=await f.api.attempts.start({requestId:"invalid",participantIdentifier:"00123",gameId:gameId as string,day:3,section:null});
  expect(result.status).toBe("rejected");
 }
 expect(f.calls).toEqual([]);expect(platformSession.needsRenewal()).toBe(false);
});

test("canonical Start IDs retain exactly the documented numeric wire format",async()=>{
 const f=fixture();await f.api.access.verify("operator-code");await f.api.participant.find("00123");
 for(const gameId of ["1","2","3","4","5"]){
  expect((await f.api.attempts.start({requestId:gameId,participantIdentifier:"00123",gameId,day:3,section:null})).status).toBe("started");
 }
 expect(f.calls.filter(call=>call.path==="/attempts/start").map(call=>call.body)).toEqual([1,2,3,4,5].map(game_id=>({student_id:sid,game_id})));
});

for(const field of ["id","student_id","game_id"] as const){
 test(`Finish rejects a mismatched ${field} and can reconcile only the original result`,async()=>{
  const f=fixture();await start(f);
  f.setFinish(data=>({...data,attempt:{...data.attempt,[field]:field==="game_id"?2:"other-identity"}}));
  await expect(f.api.results.save({attemptId:"attempt-1",score:80})).rejects.toThrow(BackendValidationError);
  const saved=await f.api.results.inspect("attempt-1");
  expect(saved).toMatchObject({attemptId:"attempt-1",participantIdentifier:"00123",gameId:"1",score:80});
  expect(f.calls.filter(call=>call.path==="/attempts/finish")).toHaveLength(1);
 });
}

test("progress cannot replace an established attempt's game identity during result recovery",async()=>{
 const f=fixture();await start(f);
 f.setProgress(data=>({...data,games:[{...data.games[1],attempt:{...data.games[0].attempt,game_id:2,status:"completed",score:80}}]}));
 await expect(f.api.results.inspect("attempt-1")).rejects.toThrow(BackendValidationError);
 await expect(f.api.results.save({attemptId:"attempt-1",score:80})).rejects.toThrow(BackendValidationError);
 expect(f.calls.filter(call=>call.path==="/attempts/finish")).toHaveLength(0);
 f.setProgress(data=>data);
 expect(await f.api.results.inspect("attempt-1")).toBeNull();
 expect((await f.api.results.save({attemptId:"attempt-1",score:80})).status).toBe("saved");
});

test("progress recovery rejects another participant, attempt, and duplicate attempt references",async()=>{
 const f=fixture();await start(f);
 for(const patch of [
  (data:any)=>({...data,student_id:"other-student"}),
  (data:any)=>({...data,games:[{...data.games[0],attempt:{...data.games[0].attempt,student_id:"other-student"}}]}),
  (data:any)=>({...data,games:[{...data.games[0],attempt:{...data.games[0].attempt,id:"other-attempt"}}]}),
  (data:any)=>({...data,games:[data.games[0],{...data.games[1],attempt:{...data.games[0].attempt,game_id:2}}]}),
 ]){
  f.setProgress(patch);await expect(f.api.results.inspect("attempt-1")).rejects.toThrow(BackendValidationError);
 }
});
