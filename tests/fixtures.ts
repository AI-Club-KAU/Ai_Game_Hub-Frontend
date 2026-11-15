import { test as base, expect, type BrowserContext, type BrowserContextOptions } from "@playwright/test";
import { isolateNetwork } from "./network-isolation";
import { TEST_ORIGIN } from "./test-environment";
import { createServer } from "node:http";

export const test = base.extend<{
  newIsolatedContext: (options?: BrowserContextOptions) => Promise<BrowserContext>;
  unexpectedNetwork: string[];
}>({
  browser: [async ({ playwright }, use) => {
    // This proxy has no forwarding code. Even a missed route/new context cannot reach an external host.
    const proxy = createServer((_request, response) => { response.writeHead(403); response.end("Offline tests only"); });
    proxy.on("connect", (_request, socket) => socket.destroy());
    await new Promise<void>(resolve => proxy.listen(0, "127.0.0.1", resolve));
    const address = proxy.address();
    if (!address || typeof address === "string") throw new Error("Cannot establish offline browser proxy");
    const browser = await playwright.chromium.launch({ channel: "chrome", proxy: {
      server: `http://127.0.0.1:${address.port}`, bypass: "127.0.0.1,localhost,[::1]",
    }, args: ["--disable-gpu", "--disable-background-networking", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp"] });
    try { await use(browser); } finally {
      await browser.close();
      proxy.closeAllConnections();
      await new Promise<void>(resolve => proxy.close(() => resolve()));
    }
  }, { scope: "worker" }],
  unexpectedNetwork: [async ({}, use) => {
    const unexpected: string[] = [];
    await use(unexpected);
    expect(unexpected, "Unmocked API/external request blocked; install an explicit fixture response").toEqual([]);
  }, { auto: true }],
  context: async ({ context, unexpectedNetwork }, use) => {
    await isolateNetwork(context, TEST_ORIGIN, unexpectedNetwork);
    await use(context);
  },
  newIsolatedContext: async ({ browser, unexpectedNetwork }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async options => {
      const context = await browser.newContext({ ...options, baseURL: TEST_ORIGIN, serviceWorkers: "block" });
      contexts.push(context);
      await isolateNetwork(context, TEST_ORIGIN, unexpectedNetwork);
      return context;
    });
    for (const context of contexts) await context.close();
  },
});
export { expect };
export type { Page, Frame } from "@playwright/test";
