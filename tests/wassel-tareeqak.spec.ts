import { test, expect } from "./fixtures";
import { getGameAsset } from "../src/features/games/game-assets";
import { wasselTareeqakScore } from "../src/features/games/wassel-tareeqak-result";
import { embedWassel, watchWasselNetwork } from "./wassel-tareeqak-test-helpers";

test("Live 3 is Wassel, Mock 3 stays QA and Live 4–5 remain blocked",()=>{
  expect(getGameAsset("3",false)?.game).toBe("wassel-tareeqak");
  expect(getGameAsset("3",true)?.game).toBe("qa");
  for(const id of ["4","5","mock","03","3.0","unknown"])expect(getGameAsset(id,false)).toBeNull();
});
test("opaque iframe loads original board, local fonts, demo, sounds and 120-second timer without a name",async({page})=>{
  const {frame}=await embedWassel(page);
  await expect(frame.locator("#playerName")).toBeHidden();await expect(frame.locator("#demoBoard")).toBeVisible();
  await expect(frame.locator("#lbStart")).toBeVisible();
  await frame.locator('#startForm button[type="submit"]').click();
  await expect.poll(()=>frame.evaluate(()=>window.eval("state.running"))).toBe(true);
  expect(await frame.evaluate(()=>window.eval("[CONFIG.GAME_SECONDS, CONFIG.ROWS, CONFIG.COLS, state.cells.size]"))).toEqual([120,5,7,35]);
  expect(await frame.evaluate(()=>document.fonts.check('16px "Lalezar"'))).toBe(true);
  expect(await frame.evaluate(()=>window.eval('Object.keys(window.SOUND_DATA).length'))).toBeGreaterThan(0);
});
test("handshake rejects wrong origin, source, version, nonce and missing port",async({page})=>{
  const {frame,nonce}=await embedWassel(page,false);
  await expect(frame.locator('#startForm button[type="submit"]')).toBeDisabled();
  for(const patch of [{version:2},{nonce:"old"},{game:"dev-run"},{type:"other"}]){
    await page.evaluate(({nonce,patch})=>{const c=new MessageChannel();document.querySelector("iframe")!.contentWindow!.postMessage({type:"ai-hub:wassel-tareeqak-init",version:1,game:"wassel-tareeqak",nonce,...patch},"*",[c.port2]);},{nonce,patch});
  }
  await frame.evaluate(nonce=>{const data={type:"ai-hub:wassel-tareeqak-init",version:1,game:"wassel-tareeqak",nonce};
    const c=new MessageChannel();window.dispatchEvent(new MessageEvent("message",{data,origin:"https://invalid.invalid",source:parent,ports:[c.port2]}));
    window.dispatchEvent(new MessageEvent("message",{data,origin:location.origin,source:window,ports:[c.port1]}));
    parent.postMessage(data,"*");},nonce);
  await page.evaluate(nonce=>document.querySelector("iframe")!.contentWindow!.postMessage({type:"ai-hub:wassel-tareeqak-init",version:1,game:"wassel-tareeqak",nonce},"*"),nonce);
  await expect(frame.locator('#startForm button[type="submit"]')).toBeDisabled();
});
test("Google stays disabled from direct initialization, including old queues and explicit Shared calls",async({page})=>{
  await watchWasselNetwork(page);
  const requests:string[]=[];page.on("request",r=>{if(/script\.google|googleapis|google\.com/.test(r.url()))requests.push(r.url());});
  await page.addInitScript(()=>localStorage.setItem("aiclub_wasel_outbox_v1",JSON.stringify([{id:"old",name:"private-old-name",score:100}])));
  await page.goto("/games/wassel-tareeqak/index.html");
  await page.evaluate(()=>window.eval('Shared.on=true;Shared.start();Shared.pull();Shared.push({id:"new"});Shared.flush();window.dispatchEvent(new Event("online"))'));
  await page.waitForTimeout(200);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("aiclub_wasel_outbox_v1")!))).toEqual([{id:"old",name:"private-old-name",score:100}]);
  expect(requests).toEqual([]);await expect(page.locator('#startForm button[type="submit"]')).toBeDisabled();
  expect(await page.evaluate(()=>(window as any).__wasselNetwork)).toEqual({fetches:0,onlineListeners:0,syncIntervals:0});
});

test("original question clicks, answer handling, timer and winning visual sequence remain functional",async({page})=>{
  const {frame,nonce}=await embedWassel(page);
  await frame.locator('#startForm button[type="submit"]').click();
  await expect.poll(()=>frame.evaluate(()=>window.eval("state.running"))).toBe(true);
  // Follow the game's own available cells toward the destination and click its real answer buttons.
  for(let i=0;i<33;i++){
    if(await frame.evaluate(()=>window.eval("Platform.completed()")))break;
    await expect.poll(()=>frame.evaluate(()=>window.eval("!state.busy"))).toBe(true);
    const answer=await frame.evaluate(()=>window.eval(`(() => {
      const choices=[...state.cells.values()].filter(c=>state.availSet.has(key(c.r,c.c)));
      choices.sort((a,b)=>bfsDistance([a.r,a.c],state.finish,()=>true)-bfsDistance([b.r,b.c],state.finish,()=>true));
      const c=choices[0];c.g.dispatchEvent(new MouseEvent("click",{bubbles:true}));return c.question.a;
    })()`));
    await frame.locator(`#qOptions button[data-idx="${answer}"]`).click();
    if(await frame.evaluate(()=>window.eval("state.finishTime !== null"))){
      await frame.evaluate(()=>window.eval('goHome();newGame("forged");document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape"}))'));
      await expect(frame.locator("#screenGame")).toHaveClass(/active/);
      break;
    }
  }
  await expect(frame.locator("#screenResult")).toHaveClass(/active/);
  await expect(frame.locator("#board .finish")).toHaveClass(/reached/);
  const messages=await page.evaluate(()=>(window as any).__wasselBridge.messages);
  expect(messages).toHaveLength(1);expect(messages[0].nonce).toBe(nonce);expect(messages[0].reached).toBe(true);
  expect(messages[0].correct).toBeGreaterThanOrEqual(7);expect(messages[0].score).toBeGreaterThanOrEqual(80);
  expect(messages[0].rawElapsedTime).toBe(await frame.evaluate(()=>window.eval("state.finishTime")));
  expect(wasselTareeqakScore(messages[0],nonce)).toBe(messages[0].score);
  await page.screenshot({path:"test-results/wassel-original-ending.png"});
});

test("the original timer keeps running during a question and ends at 120 seconds, not 180",async({page})=>{
  await page.clock.install();const {frame}=await embedWassel(page);
  await frame.locator('#startForm button[type="submit"]').click();await page.clock.runFor(3000);
  await expect.poll(()=>frame.evaluate(()=>window.eval("state.running"))).toBe(true);
  await frame.locator("#board .avail").first().click();await expect(frame.locator("#qBody")).toBeVisible();
  await page.clock.runFor(60000);
  expect(await frame.evaluate(()=>window.eval("elapsed()"))).toBeGreaterThanOrEqual(60);
  await page.clock.runFor(61000);
  await expect(frame.locator("#screenResult")).toHaveClass(/active/);
  expect(await page.evaluate(()=>(window as any).__wasselBridge.messages[0].reason)).toBe("timeout");
  expect(await page.evaluate(()=>(window as any).__wasselBridge.messages[0].rawElapsedTime)).toBe(120);
});
