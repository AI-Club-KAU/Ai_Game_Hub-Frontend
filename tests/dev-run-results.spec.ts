import { test, expect } from "./fixtures";
import { devRunScore } from "../src/features/games/dev-run-result";
import { devPacket, embedDev, finishDev } from "./dev-run-test-helpers";

test("result validator accepts 0/100 and rejects unexpected fields, stale nonce and inconsistent scores", () => {
  for (const score of [0,100] as const) expect(devRunScore(devPacket(score,"active"),"active")).toBe(score);
  const valid=devPacket(100,"active");
  for(const data of [null,[],{}, {...valid,type:"robomaze:result"},{...valid,version:0},{...valid,nonce:"old"},{...valid,game:"escape-exe"},
    {...valid,maxScore:500},{...valid,attemptId:"forged"},{...valid,stats:[]}, {...valid,breakdown:null},
    ...[-1,101,NaN,Infinity,1.5,"100",null].map(score=>({...valid,score})),
    ...[{collected:31},{correct:11},{collisions:3},{finished:"true"},{correct:9},{collected:29},{unexpected:1}].map(patch=>({...valid,stats:{...valid.stats,...patch}})),
    ...[{quiz:49},{total:99},{completion:0},{noCollision:0},{collectibles:"30"},{unexpected:1}].map(patch=>({...valid,breakdown:{...valid.breakdown,...patch}})),
  ]) expect(devRunScore(data,"active")).toBeNull();
});

for(const score of [0,100] as const) test(`real original score ${score} is nonce-bound and terminal platform paths cannot replay`, async({page,newIsolatedContext})=>{
  const touchContext=await newIsolatedContext({hasTouch:true});
  const touchPage=await touchContext.newPage();
  try {
    const {frame,nonce}=await embedDev(touchPage);
    await finishDev(frame,score);
    const messages=await touchPage.evaluate(()=>(window as any).__devBridge.messages.filter((m:any)=>m.type==="DEV_RUN_FINAL_SCORE"));
    expect(messages).toHaveLength(1); expect(devRunScore(messages[0],nonce)).toBe(score);
    await expect(frame.locator("#end-screen")).toBeVisible();
    const box=await frame.locator("#restart-btn").boundingBox();expect(box).not.toBeNull();
    await touchPage.mouse.click(box!.x+box!.width/2,box!.y+box!.height/2);
    await touchPage.touchscreen.tap(box!.x+box!.width/2,box!.y+box!.height/2);
    await touchPage.keyboard.press("Tab");await touchPage.keyboard.press("Enter");
    await frame.evaluate(()=>{
      const game=(window as any).__devRun;
      document.querySelector<HTMLButtonElement>("#restart-btn")!.click();
      document.querySelector<HTMLButtonElement>("#end-home-btn")!.click();
      document.querySelector<HTMLButtonElement>("#restart-btn")!.focus();
      game.start();game.goHome();game.resetSession();game.resume();game.init();game.startLoop();
      game.states.set("PLAYING");game.endGame(false);
    });
    await touchPage.waitForTimeout(1700);
    await expect(frame.locator("#end-screen")).toBeVisible();
    expect(await frame.evaluate(()=>({inert:document.body.inert,raf:(window as any).__devRun.rafId,focus:document.activeElement?.id}))).toEqual({inert:true,raf:0,focus:""});
    expect(await touchPage.evaluate(()=>(window as any).__devBridge.messages.filter((m:any)=>m.type==="DEV_RUN_FINAL_SCORE").length)).toBe(1);
  }finally{await touchContext.close();}
});
