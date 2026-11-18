import { test, expect } from "./fixtures";
import { getGameAsset } from "../src/features/games/game-assets";
import { spotTheAiScore } from "../src/features/games/spot-the-ai-result";
import { spotPacket, embedSpot, finishSpot } from "./spot-the-ai-test-helpers";

test("Live 5 is explicit, Game 4 blocked, Mock 5 remains QA", () => {
  expect(getGameAsset("5", false)?.game).toBe("spot-the-ai");
  expect(getGameAsset("5", true)?.game).toBe("qa");
  for (const id of ["4", "05", "5.0", "mock", "unknown"]) expect(getGameAsset(id, false)).toBeNull();
});
test("strict validator preserves raw accumulation and rounds only final total", () => {
  for (let time = 1; time <= 15; time++) {
    const packet = spotPacket("n", time);
    expect(spotTheAiScore(packet, "n")).toBe(Math.round(packet.rawScore));
  }
  expect(spotTheAiScore(spotPacket("n", 0, false), "n")).toBe(0);
  // One correct round: 12.333... -> 12; 12.5 -> 13. No per-round rounding.
  for (const [timeLeft, expected] of [[14, 12], [15, 13]]) {
    const packet = spotPacket("n", 0, false);
    packet.rounds[0] = { id: 1, side: "right", timeLeft };
    packet.rawScore = 10 + timeLeft / 15 * 2.5; packet.score = expected;
    expect(spotTheAiScore(packet, "n")).toBe(expected);
  }
  const packet = spotPacket("n", 14);
  expect(packet.score).toBe(99); // Rounding each round would incorrectly produce 96.
  for (const invalid of [null, [], {}, {...packet, nonce:"old"}, {...packet, version:2}, {...packet, game:"dev-run"},
    {...packet, type:"other"}, {...packet, maxScore:500}, {...packet, attemptId:"forged"}, {...packet, rawScore:NaN},
    {...packet, rawScore:Infinity}, {...packet, rawScore:98}, {...packet, rounds:packet.rounds.slice(1)},
    {...packet, rounds:packet.rounds.map(() => packet.rounds[0])},
    {...packet, rounds:packet.rounds.map(r => ({...r,timeLeft:1.5}))},
    {...packet, rounds:packet.rounds.map(r => ({...r,side:null}))},
    ...[-1,101,98,99.5,"99",NaN,Infinity].map(score => ({...packet,score}))]) expect(spotTheAiScore(invalid,"n")).toBeNull();
});
test("sandbox handshake, original eight rounds, one channel result and replay lock", async ({page}) => {
  const {frame, nonce} = await embedSpot(page);
  await frame.evaluate(() => (0,eval)("endGame();next();"));
  await expect(frame.locator("#start")).toHaveClass(/active/);
  await finishSpot(frame, 14);
  await expect(frame.locator("#finalScore")).toHaveText("98.7");
  const packet = await page.evaluate(() => (window as any).__spotBridge.messages[1]);
  expect(spotTheAiScore(packet, nonce)).toBe(99);
  await expect(frame.locator("#againBtn")).toBeDisabled();
  await frame.evaluate(() => (0,eval)("startGame();loadRound();next();endGame();startTimer();"));
  await frame.locator("#againBtn").dispatchEvent("click");
  await frame.locator("#againBtn").dispatchEvent("touchend");
  await page.keyboard.press("Tab"); await page.keyboard.press("Enter");
  await expect(frame.locator("#end")).toHaveClass(/active/);
  expect(await page.evaluate(() => (window as any).__spotBridge.messages.length)).toBe(2);
});
test("missing or invalid handshake cannot start embedded gameplay", async ({page}) => {
  for (const override of [null, {version:2}, {game:"other"}, {nonce:"stale"}]) {
    const {frame} = await embedSpot(page, override !== null, override ?? {});
    await frame.locator("#startBtn").click(); await expect(frame.locator("#start")).toHaveClass(/active/);
  }
  for (const wrongSource of [true, false]) {
    const {frame, nonce} = await embedSpot(page, false);
    await frame.evaluate(({wrongSource,nonce}) => {
      const channel = new MessageChannel();
      window.dispatchEvent(new MessageEvent("message", {
        source: wrongSource ? window : parent,
        origin: wrongSource ? location.origin : "https://untrusted.invalid",
        data: {type:"ai-hub:spot-the-ai-init",version:1,game:"spot-the-ai",nonce}, ports:[channel.port2],
      }));
    }, {wrongSource,nonce});
    await frame.locator("#startBtn").click(); await expect(frame.locator("#start")).toHaveClass(/active/);
  }
});
test("original 15 second round timer and standalone replay remain available", async ({page}) => {
  await page.clock.install(); await page.goto("/games/spot-the-ai/index.html");
  await page.locator("#startBtn").click(); await page.clock.runFor(15000);
  await expect(page.locator("#feedback")).toContainText("انتهى الوقت");
  await page.clock.runFor(30000); await expect(page.locator("#roundNo")).toHaveText("1");
  await page.evaluate(() => (0,eval)("next();for(let i=1;i<8;i++){answer(order[idx].ai);next();}"));
  await page.locator("#againBtn").click(); await expect(page.locator("#game")).toHaveClass(/active/);
  await expect(page.locator("#roundNo")).toHaveText("1"); await expect(page.locator("#score")).toHaveText("0");
});
