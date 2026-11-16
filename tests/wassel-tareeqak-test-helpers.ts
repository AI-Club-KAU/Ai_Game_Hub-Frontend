import { expect, type Page, type Frame } from "./fixtures";

export function wasselPacket(score: 0 | 100, nonce: string) {
  return { type: "wassel-tareeqak:result", version: 1, game: "wassel-tareeqak", nonce, score, maxScore: 100,
    rawElapsedTime: score === 100 ? 40 : 120, correct: score === 100 ? 7 : 0, wrong: 0, reached: score === 100, reason: score === 100 ? "win" : "timeout" };
}
export const nonceOfWassel = (frame: Frame) => new URL(frame.url()).searchParams.get("nonce")!;
export async function watchWasselNetwork(page: Page) {
  await page.addInitScript(() => {
    if (!location.pathname.startsWith("/games/wassel-tareeqak/")) return;
    const observed = (window as any).__wasselNetwork = { fetches: 0, onlineListeners: 0, syncIntervals: 0 };
    // A test tripwire in addition to CSP, the browser dead proxy and Node guard.
    window.fetch = async () => { observed.fetches++; throw new Error("Game fetch forbidden in offline fixture"); };
    const add = window.addEventListener.bind(window);
    window.addEventListener = ((type: string, ...args: any[]) => { if(type === "online")observed.onlineListeners++;return (add as any)(type,...args); }) as typeof window.addEventListener;
    const interval = window.setInterval.bind(window);
    window.setInterval = ((handler: TimerHandler, delay?: number, ...args: any[]) => { if(delay === 20000)observed.syncIntervals++;return interval(handler,delay,...args); }) as typeof window.setInterval;
  });
}
export async function embedWassel(page: Page, handshake = true) {
  await watchWasselNetwork(page);
  await page.route("**/__wassel-test-host", r => r.fulfill({contentType:"text/html",body:"<!doctype html><html><body></body></html>"}));
  await page.goto("/__wassel-test-host");
  const nonce = await page.evaluate(handshake => {
    const nonce = crypto.randomUUID();
    const bridge = (window as any).__wasselBridge = { nonce, ready: false, messages: [] as unknown[], port: null as MessagePort | null };
    const iframe = document.createElement("iframe"); iframe.setAttribute("sandbox","allow-scripts"); iframe.width="1100";iframe.height="1000";
    window.addEventListener("message", e => { if(e.source===iframe.contentWindow) bridge.messages.push(e.data); });
    iframe.onload=()=>{
      if(!handshake)return;
      const channel=new MessageChannel();bridge.port=channel.port1;
      channel.port1.onmessage=e=>{bridge.ready=e.data?.type==="ai-hub:wassel-tareeqak-ready"&&e.data.version===1&&e.data.game==="wassel-tareeqak"&&e.data.nonce===nonce;};
      iframe.contentWindow!.postMessage({type:"ai-hub:wassel-tareeqak-init",version:1,game:"wassel-tareeqak",nonce},"*",[channel.port2]);
    };
    iframe.src="/games/wassel-tareeqak/index.html?nonce="+nonce;document.body.replaceChildren(iframe);return nonce;
  },handshake);
  await expect(page.frameLocator("iframe").locator("#startForm")).toBeVisible();
  const frame=page.frames().find(f=>f.url().includes("/games/wassel-tareeqak/"))!;
  if(handshake)await expect.poll(()=>page.evaluate(()=>(window as any).__wasselBridge.ready)).toBe(true);
  return {frame,nonce};
}
/** Exercise the delivered endGame and unchanged computeScore, with deterministic original state. */
export async function finishWassel(frame: Frame, score: 0 | 100) {
  await frame.locator('#startForm button[type="submit"]').click();
  await expect.poll(()=>frame.evaluate(()=>window.eval("state.running"))).toBe(true);
  await frame.evaluate(score=>window.eval(score===100 ?
    'cancelAnimationFrame(state.rafId);state.correct=7;state.finishTime=40;endGame("win")' :
    'cancelAnimationFrame(state.rafId);state.startTime=performance.now()-120000;endGame("timeout")'),score);
  await expect(frame.locator("#screenResult")).toHaveClass(/active/);
  await expect(frame.locator("#rScore")).toHaveText(String(score));
}
