import { expect, type Page, type Frame } from "./fixtures";

export function devPacket(score: 0 | 100, nonce: string) {
  return { type: "DEV_RUN_FINAL_SCORE", version: 1, game: "dev-run", nonce, score, maxScore: 100,
    stats: { collected: score === 100 ? 30 : 0, correct: score === 100 ? 10 : 0, collisions: score === 100 ? 0 : 3, finished: score === 100 },
    breakdown: { collectibles: score === 100 ? 30 : 0, quiz: score === 100 ? 50 : 0,
      noCollision: score === 100 ? 10 : 0, completion: score === 100 ? 10 : 0, total: score } };
}
export const nonceOfDev = (frame: Frame) => new URL(frame.url()).searchParams.get("nonce")!;
export async function embedDev(page: Page, handshake = true) {
  // A locally fulfilled static parent avoids racing React hydration in this protocol harness.
  await page.route("**/__dev-run-test-host", route => route.fulfill({contentType:"text/html",body:"<!doctype html><html><body></body></html>"}));
  await page.goto("/__dev-run-test-host");
  const nonce = await page.evaluate(handshake => {
    const nonce = crypto.randomUUID();
    const bridge = (window as any).__devBridge = { nonce, ready: false, messages: [] as unknown[], port: null as MessagePort | null };
    window.addEventListener("message", event => { if (event.source === document.querySelector("iframe")?.contentWindow) bridge.messages.push(event.data); });
    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-scripts"); iframe.width = "1000"; iframe.height = "900";
    iframe.src = "/games/dev-run/index.html?nonce=" + nonce;
    iframe.onload = () => {
      if (!handshake) return;
      const channel = new MessageChannel(); bridge.port = channel.port1;
      channel.port1.onmessage = event => { bridge.ready = event.data?.type === "ai-hub:dev-run-ready" && event.data.nonce === nonce && event.data.version === 1 && event.data.game === "dev-run"; };
      iframe.contentWindow!.postMessage({ type: "ai-hub:dev-run-init", version: 1, game: "dev-run", nonce }, "*", [channel.port2]);
    };
    document.body.replaceChildren(iframe);
    return nonce;
  }, handshake);
  await expect(page.frameLocator("iframe").locator("#start-btn")).toBeVisible();
  const frame = page.frames().find(frame => frame.url().includes("/games/dev-run/"))!;
  if (handshake) await expect.poll(() => page.evaluate(() => (window as any).__devBridge.ready)).toBe(true);
  return { frame, nonce };
}

/** Drive the delivered game objects and original ScoreManager, not a synthetic result message. */
export async function finishDev(frame: Frame, score: 0 | 100) {
  await frame.locator("#start-btn").click();
  await frame.evaluate(score => {
    const game = (window as any).__devRun;
    game.stopLoop();
    if (score === 0) {
      for (let i = 0; i < 3; i++) game.registerHit({hit:false});
    } else {
      for (let stage = 0; stage < 3; stage++) for (let i = 0; i < 10; i++) game.progress.collect(stage);
      game.quiz.correctCount = 10;
      game.endGame(true);
    }
  }, score);
  await expect(frame.locator("#end-screen")).toBeVisible();
  await expect(frame.locator("#final-score")).toHaveText(`${score} / 100`);
}
