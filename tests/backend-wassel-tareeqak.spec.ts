import { test, expect, type Page, type Frame } from "./fixtures";
import { TEST_API_BASE_URL } from "./test-environment";
import { wasselPacket, finishWassel, nonceOfWassel } from "./wassel-tareeqak-test-helpers";

const studentId="00000000-0000-0000-0000-000000000002", attemptId="20000000-0000-0000-0000-000000000002";
async function backend(page:Page,existing=false) {
  const fresh=()=>({id:attemptId,student_id:studentId,game_id:3,status:"started",score:null as number|null,play_date:"2026-11-15",started_at:"2026-11-15T10:00:00Z"});
  let attempt=existing?fresh():null, mode="normal",lostStart=false, release:(()=>void)|undefined;
  const calls:{path:string;body:any}[]=[];
  await page.route(TEST_API_BASE_URL+"/**",async route=>{
    const request=route.request(),path=new URL(request.url()).pathname.split("/functions/v1")[1],body=request.postDataJSON();
    const respond=(value:unknown,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(value)});
    if(request.method()==="OPTIONS")return route.fulfill({status:204,headers:{"access-control-allow-origin":"*","access-control-allow-headers":"authorization,content-type","access-control-allow-methods":"GET,POST,OPTIONS"}});
    calls.push({path,body});
    if(path==="/access/verify")return respond({access_token:"wassel-tareeqak-test-token",token_type:"Bearer",expires_in:3600});
    expect(request.headers().authorization).toBe("Bearer wassel-tareeqak-test-token");
    if(path==="/students/login")return respond({student:{id:studentId,student_number:"00123",full_name:"مشارك Wassel Tareeqak"}});
    if(path.endsWith("/progress"))return respond({student_id:studentId,play_date:"2026-11-15",total_score:attempt?.score??0,games_completed:attempt?.status==="completed"?1:0,
      games:[1,2,3,4,5].map(id=>({id,name:id===3?"Wassel Tareeqak":"Game "+id,max_score:100,is_active:true,attempt:id===3?attempt:null,eligible_to_start:id!==3||!attempt}))});
    if(path==="/attempts/start") {
      expect(body).toEqual({student_id:studentId,game_id:3});
      if(attempt)return respond({error:{code:"game_already_attempted"}},409);
      attempt=fresh();if(lostStart)return route.abort();return respond({attempt},201);
    }
    if(path==="/attempts/finish") {
      expect(Object.keys(body).sort()).toEqual(["attempt_id","score"]);expect(body.attempt_id).toBe(attemptId);
      const fault=mode;
      if(fault==="pending")await new Promise<void>(resolve=>{release=resolve;});
      if(fault==="offline")return route.abort();
      if(attempt?.status==="completed")return respond({error:{code:"attempt_already_completed"}},409);
      expect(attempt?.status).toBe("started");attempt={...attempt!,status:"completed",score:body.score};
      if(fault==="lost")return route.abort();
      return respond({attempt:fault==="identity"?{...attempt,game_id:1}:attempt,score_saved:true,total_available:true,total_score:attempt.score,games_completed:1});
    }
    if(path==="/leaderboard")return respond({leaderboard:attempt?.status==="completed"?[{full_name:"مشارك Wassel Tareeqak",total_score:attempt.score,games_completed:1}]:[]});
    await route.abort();throw new Error("Unmocked Wassel Tareeqak test API route");
  });
  return {starts:()=>calls.filter(c=>c.path==="/attempts/start"),finishes:()=>calls.filter(c=>c.path==="/attempts/finish"),
    setMode:(value:string)=>{mode=value;},loseStart:()=>{lostStart=true;},release:()=>{expect(release).toBeDefined();release!();}};
}
async function identify(page:Page) {
  await page.goto("/");await page.locator("#access-code").fill("offline-test-only");
  await page.getByRole("button",{name:"الدخول إلى البوث"}).click();await page.getByRole("button",{name:"تجهيز البوث",exact:true}).click();
  await page.getByRole("button",{name:"مشارك سابق",exact:true}).click();await page.locator("#participant-id").fill("00123");
  await page.getByRole("button",{name:"استرجاع المشارك",exact:true}).click();
  await expect(page.locator('input[name="eligible-game"]')).toHaveCount(5);
}
async function ready(page:Page) {
  await expect(page.locator(".game-mode-footer")).toContainText("تم تحميل صفحة اللعبة");
  return page.frames().find(frame=>frame.url().includes("/games/wassel-tareeqak/"))!;
}
async function launch(page:Page) {
  await identify(page);await page.locator('input[name="eligible-game"][value="3"]').check();
  await page.getByRole("button",{name:"تأكيد اختيار اللعبة"}).click();
  await page.getByRole("button",{name:"ابدأ اللعب",exact:true}).evaluate(button=>{(button as HTMLButtonElement).click();(button as HTMLButtonElement).click();});
  return ready(page);
}
const send=(frame:Frame,data:unknown)=>frame.evaluate(data=>parent.postMessage(data,"*"),data);
const warns=(page:Page)=>page.evaluate(()=>!window.dispatchEvent(new Event("beforeunload",{cancelable:true})));
test.describe.configure({timeout:60000});

test("Live 3 starts once with real Wassel Tareeqak; games 4–5 stay blocked and no identity enters iframe",async({page})=>{
  const api=await backend(page);await identify(page);
  for(const id of ["4","5"]) {
    await page.locator(`input[name="eligible-game"][value="${id}"]`).check();await page.getByRole("button",{name:"تأكيد اختيار اللعبة"}).click();
    await expect(page.getByRole("button",{name:"ابدأ اللعب",exact:true})).toBeDisabled();await page.getByRole("button",{name:"تغيير الاختيار",exact:true}).click();
  }
  await page.locator('input[name="eligible-game"][value="3"]').check();await page.getByRole("button",{name:"تأكيد اختيار اللعبة"}).click();
  await page.getByRole("button",{name:"ابدأ اللعب",exact:true}).evaluate(button=>{(button as HTMLButtonElement).click();(button as HTMLButtonElement).click();});
  const frame=await ready(page);
  expect(api.starts()).toHaveLength(1);expect([...new URL(frame.url()).searchParams.keys()]).toEqual(["nonce"]);
  await expect(page.locator("iframe")).toHaveAttribute("sandbox","allow-scripts");
  await expect(frame.locator("#timeValue")).toHaveText("2:00");
  await expect(page.locator(".result-demo,.attempt-demo")).toHaveCount(0);
});

test("interruption and refresh resume the same attempt with fresh nonce and reset 120-second game; never Start again",async({page})=>{
  const api=await backend(page,true);await identify(page);await page.getByRole("button",{name:"استئناف المحاولة",exact:true}).click();
  const first=await ready(page),oldNonce=nonceOfWassel(first);await first.locator("#startForm button").click();
  await expect(first.locator("#timeValue")).not.toHaveText("2:00");
  await page.getByRole("button",{name:"طلب مساعدة"}).click();await page.getByRole("button",{name:"العودة إلى شاشة الموظف"}).click();
  await page.getByRole("button",{name:"استئناف المحاولة",exact:true}).click();const second=await ready(page),secondNonce=nonceOfWassel(second);
  expect(secondNonce).not.toBe(oldNonce);await expect(second.locator("#screenStart")).toBeVisible();
  await page.reload();await identify(page);await page.getByRole("button",{name:"استئناف المحاولة",exact:true}).click();
  const third=await ready(page);expect(nonceOfWassel(third)).not.toBe(secondNonce);await expect(third.locator("#timeValue")).toHaveText("2:00");
  await finishWassel(third,0);await expect(page.locator(".result-score b")).toHaveText("0");
  expect(api.starts()).toHaveLength(0);expect(api.finishes().map(c=>c.body)).toEqual([{attempt_id:attemptId,score:0}]);
});

test("wrong source/origin/game/version, stale and malformed results cannot Finish; first valid result wins",async({page})=>{
  const api=await backend(page),old=await launch(page),oldNonce=nonceOfWassel(old);
  const oldWindow=await page.evaluateHandle(()=>document.querySelector("iframe")!.contentWindow);
  await page.getByRole("button",{name:"طلب مساعدة"}).click();await page.getByRole("button",{name:"العودة إلى شاشة الموظف"}).click();
  await page.getByRole("button",{name:"استئناف المحاولة",exact:true}).click();
  const frame=await ready(page),valid=wasselPacket(100,nonceOfWassel(frame));
  await page.evaluate(({data,oldWindow})=>{
    window.postMessage(data,"*");
    window.dispatchEvent(new MessageEvent("message",{origin:"null",source:oldWindow,data}));
    window.dispatchEvent(new MessageEvent("message",{origin:location.origin,source:document.querySelector("iframe")!.contentWindow,data}));
  },{data:valid,oldWindow});
  await send(frame,wasselPacket(100,oldNonce));
  for(const data of [{...valid,type:"robomaze:result"},{...valid,version:2},{...valid,game:"qa"},{...valid,attemptId:"forged"},
    ...[-1,101,1.5,"100",NaN,Infinity].map(score=>({...valid,score})),{...valid,rawElapsedTime:40.01}])await send(frame,data);
  await page.waitForTimeout(250);expect(api.finishes()).toHaveLength(0);expect(await warns(page)).toBe(false);
  await frame.evaluate(data=>{parent.postMessage(data,"*");parent.postMessage(data,"*");},valid);
  await expect(page.locator(".result-score b")).toHaveText("100");
  await send(frame,wasselPacket(0,nonceOfWassel(frame)));expect(api.finishes()).toHaveLength(1);
});

test("pending save keeps ending and unload warning; only confirmation begins 10-second same-participant return and progress/leaderboard refresh",async({page})=>{
  await page.clock.install();const api=await backend(page),frame=await launch(page);api.setMode("pending");
  await finishWassel(frame,100);await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));
  await expect.poll(()=>api.finishes().length).toBe(1);expect(await warns(page)).toBe(true);
  await page.clock.runFor(5000);await expect(page.locator(".result-embedded")).not.toContainText("العودة إلى اختيار ألعابك خلال");
  await expect(frame.locator("#screenResult")).toBeVisible();await expect(page.locator("iframe")).toHaveAttribute("inert","");
  api.release();await expect(page.getByRole("heading",{name:"تم تأكيد حفظ النتيجة"})).toBeVisible();expect(await warns(page)).toBe(false);
  await page.clock.runFor(9999);await expect(page.locator("iframe")).toHaveCount(1);
  await page.clock.runFor(1);await expect(page.locator("iframe")).toHaveCount(0);await page.clock.resume();
  await expect(page.locator(".participant-details dd").last()).toHaveText("00123");
  await expect(page.locator('input[name="eligible-game"][value="3"]')).toBeDisabled();
  await expect(page.locator(".progress-stats strong").first()).toHaveText("100 / 500");expect(api.starts()).toHaveLength(1);expect(api.finishes()).toHaveLength(1);
  await page.getByRole("button",{name:"تجهيز مشارك آخر"}).click();await page.getByRole("button",{name:"لوحة المتصدرين",exact:true}).click();
  await expect(page.locator(".leaderboard-points strong")).toHaveText("100");
});

for(const mode of ["lost","offline","identity"])test(`${mode} Finish stays unconfirmed until safe recovery, without another Start`,async({page})=>{
  const api=await backend(page),frame=await launch(page);api.setMode(mode);await finishWassel(frame,0);
  await expect(page.locator(".result-card").getByRole("alert")).toBeVisible();expect(await warns(page)).toBe(true);
  await expect(page.locator(".result-embedded")).not.toContainText("العودة إلى اختيار ألعابك خلال");
  if(mode==="offline") {api.setMode("normal");await page.getByRole("button",{name:"إعادة محاولة الحفظ",exact:true}).click();}
  else await page.getByRole("button",{name:"التحقق من حالة الحفظ",exact:true}).click();
  await expect(page.locator(".result-score b")).toHaveText("0");expect(api.starts()).toHaveLength(1);expect(api.finishes()).toHaveLength(mode==="offline"?2:1);
  expect(api.finishes().every(c=>c.body.attempt_id===attemptId&&c.body.score===0)).toBe(true);
});

test("lost Start and missing HTML recover the same attempt without duplicate Start",async({page})=>{
  const api=await backend(page);api.loseStart();await identify(page);
  await page.locator('input[name="eligible-game"][value="3"]').check();await page.getByRole("button",{name:"تأكيد اختيار اللعبة"}).click();
  await page.getByRole("button",{name:"ابدأ اللعب",exact:true}).click();await expect(page.locator(".attempt-panel").getByRole("alert")).toContainText("لم يصل تأكيد البدء");
  await page.getByRole("button",{name:"التحقق من حالة المحاولة",exact:true}).click();
  let missing=true;await page.route("**/games/wassel-tareeqak/index.html*",route=>missing?route.fulfill({status:404,contentType:"text/html",body:"missing"}):route.fallback());
  await page.getByRole("button",{name:"استئناف المحاولة",exact:true}).click();await expect(page.locator(".game-load-error")).toBeVisible();
  missing=false;await page.getByRole("button",{name:"إعادة تحميل الحاوية"}).click();await ready(page);expect(api.starts()).toHaveLength(1);
});

test("raw elapsed scoring reaches Finish unchanged",async({page})=>{
 const api=await backend(page),frame=await launch(page);
 await frame.locator('#startForm button').click();
 await expect.poll(()=>frame.evaluate(()=>window.eval("state.running"))).toBe(true);
 await frame.evaluate(()=>window.eval('cancelAnimationFrame(state.rafId);state.correct=7;state.finishTime=40.01;endGame("win")'));
 await expect(page.locator(".result-score b")).toHaveText("99");
 expect(api.finishes().map(c=>c.body)).toEqual([{attempt_id:attemptId,score:99}]);
});

test("missing JavaScript readiness times out and retry gets a fresh nonce without another Start",async({page})=>{
  await page.clock.install();const api=await backend(page);let missing=true;
  await page.route("**/games/wassel-tareeqak/script.js",route=>missing?route.fulfill({contentType:"text/javascript",body:"void 0;"}):route.fallback());
  await identify(page);await page.locator('input[name="eligible-game"][value="3"]').check();await page.getByRole("button",{name:"تأكيد اختيار اللعبة"}).click();
  await page.getByRole("button",{name:"ابدأ اللعب",exact:true}).click();await expect(page.locator("iframe")).toHaveCount(1);
  const oldNonce=new URL((await page.locator("iframe").getAttribute("src"))!,page.url()).searchParams.get("nonce");
  await page.clock.runFor(12500);await expect(page.locator(".game-load-error")).toBeVisible();
  missing=false;await page.getByRole("button",{name:"إعادة تحميل الحاوية"}).click();const frame=await ready(page);
  expect(nonceOfWassel(frame)).not.toBe(oldNonce);expect(api.starts()).toHaveLength(1);expect(api.finishes()).toHaveLength(0);
});
