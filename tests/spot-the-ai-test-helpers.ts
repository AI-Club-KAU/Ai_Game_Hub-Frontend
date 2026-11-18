import { expect, type Page, type Frame } from "./fixtures";

export function spotPacket(nonce: string, timeLeft = 15, correct = true) {
  const answers = ["right", "left", "right", "right", "left", "left", "right", "left"];
  const rounds = answers.map((side, i) => ({ id: i + 1, side: correct ? side : null, timeLeft: correct ? timeLeft : 0 }));
  const rawScore = rounds.reduce((sum, round) => sum + (correct ? 10 + round.timeLeft / 15 * 2.5 : 0), 0);
  return { type: "spot-the-ai:result", version: 1, game: "spot-the-ai", nonce, score: Math.round(rawScore), maxScore: 100, rawScore, rounds };
}
export const nonceOfSpot = (frame: Frame) => new URL(frame.url()).searchParams.get("nonce")!;
export async function captureSpotPort(page: Page) {
  await page.addInitScript(() => {
    if (!location.pathname.startsWith("/games/spot-the-ai/")) return;
    window.addEventListener("message", e => {
      if (e.source === parent && e.data?.type === "ai-hub:spot-the-ai-init" && e.ports.length === 1) (window as any).__spotTestPort = e.ports[0];
    });
  });
}
export const sendSpotPort = (frame: Frame, data: unknown) => frame.evaluate(data => (window as any).__spotTestPort.postMessage(data), data);
export async function finishSpot(frame: Frame, timeLeft = 15, correct = true) {
  await frame.locator("#startBtn").click();
  // Exercise the original answer/next/endGame functions and real integration reporting.
  await frame.evaluate(({timeLeft, correct}) => {
    (0, eval)(`for(let i=0;i<8;i++){timeLeft=${timeLeft};answer(${correct ? "order[idx].ai" : "null"});next();}`);
  }, { timeLeft: correct ? timeLeft : 0, correct });
}
export async function embedSpot(page: Page, handshake = true, initOverride: Record<string, unknown> = {}) {
  await page.route("**/__spot-host", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><body></body>" }));
  await page.goto("/__spot-host");
  const nonce = await page.evaluate(({handshake, initOverride}) => {
    const nonce = crypto.randomUUID();
    const bridge = (window as any).__spotBridge = { nonce, messages: [] as any[], port: null as MessagePort | null };
    const frame = document.createElement("iframe"); frame.setAttribute("sandbox", "allow-scripts"); frame.width = "1100"; frame.height = "950";
    frame.onload = () => {
      if (!handshake) return;
      const channel = new MessageChannel(); bridge.port = channel.port1;
      channel.port1.onmessage = e => bridge.messages.push(e.data);
      frame.contentWindow!.postMessage({ type: "ai-hub:spot-the-ai-init", version: 1, game: "spot-the-ai", nonce, ...initOverride }, "*", [channel.port2]);
    };
    frame.src = "/games/spot-the-ai/index.html?nonce=" + nonce; document.body.replaceChildren(frame); return nonce;
  }, { handshake, initOverride });
  await expect(page.frameLocator("iframe").locator("#startBtn")).toBeVisible();
  const frame = page.frames().find(frame => frame.url().includes("/games/spot-the-ai/"))!;
  if (handshake && !Object.keys(initOverride).length) await expect.poll(() => page.evaluate(() => (window as any).__spotBridge.messages.length)).toBe(1);
  return { frame, nonce };
}
