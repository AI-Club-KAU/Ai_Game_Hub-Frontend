import { test, expect } from "./fixtures";
import { wasselTareeqakScore } from "../src/features/games/wassel-tareeqak-result";
import { embedWassel, finishWassel, wasselPacket } from "./wassel-tareeqak-test-helpers";

test("strict result validation uses raw time and rejects malformed, stale or inconsistent results",()=>{
  for(const score of [0,100] as const)expect(wasselTareeqakScore(wasselPacket(score,"n"),"n")).toBe(score);
  const valid=wasselPacket(100,"n");
  for(const data of [null,[],{}, {...valid,version:2},{...valid,nonce:"old"},{...valid,game:"dev-run"},{...valid,type:"other"},
    {...valid,maxScore:500},{...valid,attemptId:"forged"},{...valid,reason:"timeout"},{...valid,reached:false},
    ...[-1,101,NaN,Infinity,0.5,"100"].map(score=>({...valid,score})),
    ...[-1,121,NaN,Infinity,"40"].map(rawElapsedTime=>({...valid,rawElapsedTime})),
    ...[-1,34,1.5,"7"].map(correct=>({...valid,correct})),{...valid,correct:33,wrong:1},{...valid,correct:6},
    {...wasselPacket(0,"n"),rawElapsedTime:119.9}])expect(wasselTareeqakScore(data,"n")).toBeNull();
  // 40.01 displays as 40.0 but must score 99, not 100.
  expect(wasselTareeqakScore({...valid,rawElapsedTime:40.01,score:99},"n")).toBe(99);
  expect(wasselTareeqakScore({...valid,rawElapsedTime:40.01},"n")).toBeNull();
  expect(wasselTareeqakScore({...valid,rawElapsedTime:120,score:80},"n")).toBe(80);
  expect(wasselTareeqakScore({...valid,reached:false,reason:"blocked",wrong:2,score:70},"n")).toBe(70);
});

for(const score of [0,100] as const)test(`original ending ${score}, local board and replay lock survive mouse, touch, keyboard and direct callbacks`,async({newIsolatedContext})=>{
  const context=await newIsolatedContext({hasTouch:true});const page=await context.newPage();
  try{
    const {frame,nonce}=await embedWassel(page);await finishWassel(frame,score);
    const messages=()=>page.evaluate(()=>(window as any).__wasselBridge.messages);
    expect(await messages()).toHaveLength(1);expect(wasselTareeqakScore((await messages())[0],nonce)).toBe(score);
    await expect(frame.locator("#lbResult .me")).toContainText(String(score));
    await expect(frame.locator("#btnAgain")).toHaveCount(0);
    await page.keyboard.press("Tab");await page.keyboard.press("Enter");await page.keyboard.press("Escape");
    await page.mouse.click(400,400);await page.touchscreen.tap(400,400);
    await frame.evaluate(()=>window.eval('newGame("forged");goHome();document.querySelector("#startForm").dispatchEvent(new Event("submit",{cancelable:true}));setTimeout(()=>document.querySelector("#startForm button").focus(),10)'));
    await expect(frame.locator("#screenResult")).toHaveClass(/active/);
    expect(await frame.evaluate(()=>document.body.inert)).toBe(true);expect(await messages()).toHaveLength(1);
    expect(await frame.evaluate(()=>(window as any).__wasselNetwork)).toEqual({fetches:0,onlineListeners:0,syncIntervals:0});
    // The original 25-second return must no longer schedule any transition.
    await page.clock.install();await page.clock.runFor(30000);
    await expect(frame.locator("#screenResult")).toHaveClass(/active/);
  }finally{await context.close();}
});
