import type { BrowserContext } from "@playwright/test";

export async function isolateNetwork(context: BrowserContext, origin: string, unexpected: string[]) {
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && !url.pathname.startsWith("/functions/v1/")) return route.continue();
    unexpected.push(`${url.origin}${url.pathname}`);
    await route.abort("blockedbyclient");
  });
  await context.routeWebSocket("**/*", socket => {
    const url = new URL(socket.url());
    if (url.origin.replace(/^ws/, "http") === origin) socket.connectToServer();
    else {
      unexpected.push("Unexpected external WebSocket");
      socket.close();
    }
  });
}
