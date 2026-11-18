import { test, expect, type Page, type Frame } from "./fixtures";
import { TEST_API_BASE_URL } from "./test-environment";
import { spotPacket, finishSpot, nonceOfSpot, captureSpotPort, sendSpotPort } from "./spot-the-ai-test-helpers";

const studentId="00000000-0000-0000-0000-000000000002", attemptId="20000000-0000-0000-0000-000000000002";
async function backend(page:Page,existing=false) {
  const fresh=()=>({id:attemptId,student_id:studentId,game_id:5,status:"started",score:null as number|null,play_date:"2026-11-15",started_at:"2026-11-15T10:00:00Z"});
  let attempt=existing?fresh():null, mode="normal",lostStart=false, release:(()=>void)|undefined;
  const calls:{path:string;body:any}[]=[];
  await page.route(TEST_API_BASE_URL+"/**",async route=>{
    const request=route.request(),path=new URL(request.url()).pathname.split("/functions/v1")[1],body=request.postDataJSON();
    const respond=(value:unknown,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(value)});
    if(request.method()==="OPTIONS")return route.fulfill({status:204,headers:{"access-control-allow-origin":"*","access-control-allow-headers":"authorization,content-type","access-control-allow-methods":"GET,POST,OPTIONS"}});
    calls.push({path,body});
    if(path==="/access/verify")return respond({access_token:"spot-the-ai-test-token",token_type:"Bearer",expires_in:3600});
    expect(request.headers().authorization).toBe("Bearer spot-the-ai-test-token");
    if(path==="/students/login")return respond({student:{id:studentId,student_number:"00123",full_name:"مشارك Spot The AI"}});
    if(path.endsWith("/progress"))return respond({student_id:studentId,play_date:"2026-11-15",total_score:attempt?.score??0,games_completed:attempt?.status==="completed"?1:0,
      games:[1,2,3,4,5].map(id=>({id,name:id===5?"Spot The AI":"Game "+id,max_score:100,is_active:true,attempt:id===5?attempt:null,eligible_to_start:id!==5||!attempt}))});
    if(path==="/attempts/start") {
      expect(body).toEqual({student_id:studentId,game_id:5});
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
    if(path==="/leaderboard")return respond({leaderboard:attempt?.status==="completed"?[{full_name:"مشارك Spot The AI",total_score:attempt.score,games_completed:1}]:[]});
    await route.abort();throw new Error("Unmocked Spot The AI test API route");
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
  return page.frames().find(frame=>frame.url().includes("/games/spot-the-ai/"))!;
}
async function launch(page:Page) { await captureSpotPort(page);
  await identify(page);await page.locator('input[name="eligible-game"][value="5"]').check();
  await page.getByRole("button",{name:"تأكيد اختيار اللعبة"}).click();
  await page.getByRole("button",{name:"ابدأ اللعب",exact:true}).evaluate(button=>{(button as HTMLButtonElement).click();(button as HTMLButtonElement).click();});
  return ready(page);
}

test.describe.configure({timeout:60000});
test("Live 5 starts once, Game 4 locked; channel result saves rounded score and returns same participant", async ({page}) => {
  const api = await backend(page); await captureSpotPort(page); await identify(page);
  await page.locator('input[name="eligible-game"][value="4"]').check();
  await page.getByRole("button", {name:"تأكيد اختيار اللعبة"}).click();
  await expect(page.getByRole("button", {name:"ابدأ اللعب",exact:true})).toBeDisabled();
  await page.getByRole("button", {name:"تغيير الاختيار",exact:true}).click();
  await page.locator('input[name="eligible-game"][value="5"]').check();
  await page.getByRole("button", {name:"تأكيد اختيار اللعبة"}).click();
  await page.getByRole("button", {name:"ابدأ اللعب",exact:true}).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  const frame = await ready(page); expect(api.starts()).toHaveLength(1);
  expect(await page.locator("iframe").getAttribute("sandbox")).toBe("allow-scripts");
  await page.clock.install(); api.setMode("pending"); await finishSpot(frame, 14);
  await expect.poll(() => api.finishes().length).toBe(1);
  await page.clock.runFor(11000);
  await expect(page.locator(".result-embedded")).not.toContainText("العودة إلى اختيار ألعابك خلال");
  expect(await page.evaluate(() => !window.dispatchEvent(new Event("beforeunload", {cancelable:true})))).toBe(true);
  await sendSpotPort(frame, spotPacket(nonceOfSpot(frame))); expect(api.finishes()).toHaveLength(1);
  api.release(); await expect(page.locator(".result-score b")).toHaveText("99");
  expect(api.finishes()[0].body).toEqual({attempt_id:attemptId,score:99});
  await page.clock.runFor(9900); await expect(page.locator("iframe")).toHaveCount(1);
  await page.clock.runFor(100); await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.locator('input[name="eligible-game"][value="5"]')).toBeDisabled();
  await expect(page.locator(".progress-stats strong").first()).toHaveText("99 / 500");
  await expect(page.getByText("مشارك Spot The AI", {exact:true}).first()).toBeVisible();
});
test("wrong window/source, malformed, premature and stale results do not Finish; first port result wins", async ({page}) => {
  const api = await backend(page); const frame = await launch(page), nonce = nonceOfSpot(frame), valid = spotPacket(nonce);
  await frame.evaluate(packet => parent.postMessage(packet,"*"), valid);
  await page.evaluate(packet => window.postMessage(packet,"*"), valid);
  for (const packet of [{...valid,nonce:"stale"},{...valid,version:2},{...valid,rounds:valid.rounds.slice(1)},
    {...valid,score:100.5},{...valid,score:0},{...valid,game:"escape-exe"},{...valid,attemptId:"other"}]) await sendSpotPort(frame, packet);
  await page.waitForTimeout(150); expect(api.finishes()).toHaveLength(0);
  await finishSpot(frame); await expect(page.locator(".result-score b")).toHaveText("100");
  await sendSpotPort(frame, valid); await sendSpotPort(frame, valid);
  await page.waitForTimeout(100); expect(api.finishes()).toHaveLength(1);
});
test("refresh and resume recover same attempt with fresh nonce and no Start; lost Finish reconciles zero", async ({page}) => {
  const api=await backend(page,true); await captureSpotPort(page); await identify(page);
  await page.getByRole("button",{name:"استئناف المحاولة",exact:true}).click();
  const first=await ready(page), nonce=nonceOfSpot(first);
  await page.getByRole("button",{name:"طلب مساعدة"}).click(); await page.getByRole("button",{name:"العودة إلى شاشة الموظف"}).click();
  await page.getByRole("button",{name:"استئناف المحاولة",exact:true}).click();
  const second=await ready(page); expect(nonceOfSpot(second)).not.toBe(nonce);
  await sendSpotPort(second,spotPacket(nonce)); await page.waitForTimeout(100); expect(api.finishes()).toHaveLength(0);
  const secondNonce=nonceOfSpot(second); await page.reload(); await identify(page);
  await page.getByRole("button",{name:"استئناف المحاولة",exact:true}).click();
  const third=await ready(page); expect(nonceOfSpot(third)).not.toBe(secondNonce); await expect(third.locator("#start")).toHaveClass(/active/);
  api.setMode("lost"); await finishSpot(third,0,false);
  await expect(page.getByRole("button",{name:"التحقق من حالة الحفظ"})).toBeVisible();
  await page.getByRole("button",{name:"التحقق من حالة الحفظ"}).click();
  await expect(page.locator(".result-score b")).toHaveText("0");
  expect(api.starts()).toHaveLength(0); expect(api.finishes().map(c=>c.body)).toEqual([{attempt_id:attemptId,score:0}]);
});
