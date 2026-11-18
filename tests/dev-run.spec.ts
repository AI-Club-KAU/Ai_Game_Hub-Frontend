import { test, expect } from "./fixtures";
import { embedDev, finishDev } from "./dev-run-test-helpers";
import { getGameAsset } from "../src/features/games/game-assets";

test("Live 2 is Dev Run while the entire five-game Mock catalog stays unchanged", () => {
  expect(getGameAsset("1", false)?.game).toBe("escape-exe");
  expect(getGameAsset("2", false)).toEqual({game:"dev-run",entry:"/games/dev-run/index.html",readiness:"load"});
  expect(getGameAsset("mock", true)?.game).toBe("escape-exe");
  for (const id of ["2","3","4","5"]) expect(getGameAsset(id, true)?.game).toBe("qa");
  for (const id of ["4","mock","02","2.0","unknown"]) expect(getGameAsset(id, false)).toBeNull();
});

test("static entry, relative fonts and original audio initialize inside allow-scripts only", async ({ page }) => {
  const {frame} = await embedDev(page);
  await expect(page.locator("iframe")).toHaveAttribute("sandbox", "allow-scripts");
  await frame.evaluate(async () => { await Promise.all([400,700,800].map(weight=>document.fonts.load(`${weight} 16px "Tajawal"`))); await document.fonts.ready; });
  expect(await frame.evaluate(() => document.fonts.check('400 16px "Tajawal"') && document.fonts.check('700 16px "Tajawal"') && document.fonts.check('800 16px "Tajawal"'))).toBe(true);
  await frame.locator("#start-btn").click();
  expect(await frame.evaluate(() => { const game=(window as any).__devRun;return game.sound.ctx === null || game.sound.ctx.state === "running"; })).toBe(true);
  await expect(frame.locator("#game-timer")).toHaveText("2:00");
});

test("original 120-second gameplay clock pauses for questions and pause, including beyond 180 wall seconds", async ({ page }) => {
  await page.clock.install();
  const {frame} = await embedDev(page);
  await frame.locator("#start-btn").click();
  await frame.evaluate(() => {
    const game=(window as any).__devRun;game.stopLoop();game.session.elapsed=9.99;
    game.update(0.02); // the real first gate pauses exactly at gameplay second 10
  });
  await expect(frame.locator("#gate-question")).toBeVisible();
  const elapsed = await frame.evaluate(() => (window as any).__devRun.session.elapsed);
  expect(elapsed).toBe(10);
  await page.clock.runFor(181000);
  expect(await frame.evaluate(() => (window as any).__devRun.session.elapsed)).toBe(elapsed);
  await expect(frame.locator("#end-screen")).toBeHidden();
  await frame.locator(".quiz-option").first().click();
  await frame.locator("#continue-btn").click();
  await frame.locator("#pause-btn").click();
  const paused = await frame.evaluate(() => (window as any).__devRun.session.elapsed);
  await page.clock.runFor(10000);
  expect(await frame.evaluate(() => (window as any).__devRun.session.elapsed)).toBe(paused);
  await frame.locator("#resume-btn").click();
  await page.clock.runFor(200);
  expect(await frame.evaluate(() => (window as any).__devRun.session.elapsed)).toBeGreaterThan(paused);
  expect(await frame.evaluate(() => (window as any).__devRun.session.lives)).toBe(3);
});

test("query parameters and invalid parent messages cannot enable platform mode; standalone replay survives", async ({ page }) => {
  await page.goto("/games/dev-run/index.html?platform=1&nonce=untrusted");
  await finishDev(page.mainFrame(),0);
  await page.locator("#restart-btn").click();
  await expect(page.locator("#game-screen")).toBeVisible();
  await page.evaluate(() => (window as any).__devRun.goHome());
  await expect(page.locator("#start-screen")).toBeVisible();
  const {frame,nonce}=await embedDev(page,false);
  await frame.evaluate(nonce => window.postMessage({type:"ai-hub:dev-run-init",version:1,game:"dev-run",nonce},"*"),nonce);
  await page.evaluate(nonce => {
    const target=document.querySelector("iframe")!.contentWindow!;
    for (const patch of [{version:2},{game:"escape-exe"},{nonce:"old"}]) {
      const channel=new MessageChannel();
      target.postMessage({type:"ai-hub:dev-run-init",version:1,game:"dev-run",nonce,...patch},"*",[channel.port2]);
    }
    target.postMessage({type:"ai-hub:dev-run-init",version:1,game:"dev-run",nonce},"*"); // missing MessagePort
  },nonce);
  await frame.evaluate(nonce=>{
    const channel=new MessageChannel();
    window.dispatchEvent(new MessageEvent("message",{source:parent,origin:"https://forged.invalid",ports:[channel.port2],
      data:{type:"ai-hub:dev-run-init",version:1,game:"dev-run",nonce}}));
  },nonce);
  await finishDev(frame,0);
  const message=await page.evaluate(() => (window as any).__devBridge.messages.find((m:any)=>m.type==="DEV_RUN_FINAL_SCORE"));
  expect(message).toEqual({type:"DEV_RUN_FINAL_SCORE",score:0});
  await frame.locator("#restart-btn").click();
  await expect(frame.locator("#game-screen")).toBeVisible();
});

test("the original engine completes its three stages and ten questions around 120 gameplay seconds", async ({ page }) => {
  const {frame}=await embedDev(page);await frame.locator("#start-btn").click();
  const result=await frame.evaluate(()=>{
    const game=(window as any).__devRun, stages=new Set<number>();game.stopLoop();
    // Deterministic engine exercise: suppress collisions, retain original timing/questions/finish/scoring.
    game.session.invulnerable=1000;
    for(let i=0;i<3000&&!game.states.is("VICTORY","GAME_OVER");i++) {
      stages.add(game.stages.index);
      if(game.states.is("QUIZ")){game.quiz.answer(game.quiz.active.q.correctIndex);game.quiz.close();}
      else game.update(0.05);
      game.stopLoop();
    }
    return {state:game.states.current,elapsed:game.session.elapsed,stages:[...stages],answered:game.quiz.answeredGates.size,correct:game.quiz.correctCount,score:(window as any).finalScore};
  });
  expect(result.state).toBe("VICTORY");expect(result.stages).toEqual([0,1,2]);expect(result.answered).toBe(10);expect(result.correct).toBe(10);
  expect(result.elapsed).toBeGreaterThan(119);expect(result.elapsed).toBeLessThan(122);
  expect(Number.isInteger(result.score)).toBe(true);expect(result.score).toBeGreaterThanOrEqual(70);expect(result.score).toBeLessThanOrEqual(100);
  await expect(frame.locator("#end-screen")).toBeVisible();
});
