
import { platformSession } from "./platform-session";
export class ApiError extends Error {
  constructor(public status: number, public code: string) { super("تعذّر إكمال الطلب."); }
}
export function createApiClient(base: string, transport: typeof fetch = fetch) {
  const url = new URL(base);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost","127.0.0.1"].includes(url.hostname))) throw new Error("Use HTTPS or local test API");
  if (url.username || url.password || url.search || url.hash) throw new Error("Invalid API base URL");
  return async function request<T>(path: string, body?: unknown, protectedRoute = true): Promise<T> {
    for (let pass = 0; pass < 2; pass++) {
      if (protectedRoute && !platformSession.getToken()) await platformSession.renew();
      const usedToken = protectedRoute ? platformSession.getToken() : null;
      const response = await transport((base.endsWith("/") ? base.slice(0,-1) : base) + path, {
        method: body === undefined ? "GET" : "POST", cache: "no-store",
        headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(usedToken ? { Authorization: "Bearer " + usedToken } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json().catch(() => { throw new Error("Invalid API response"); });
      // Backend rejects authentication before mutations. Retry only this explicit 401, never a network/500 write.
      if (protectedRoute && response.status === 401 && data?.error?.code === "invalid_platform_token" && pass === 0) {
        if (!platformSession.getToken() || platformSession.getToken() === usedToken) await platformSession.renew();
        continue;
      }
      if (!response.ok) throw new ApiError(response.status, typeof data?.error?.code === "string" ? data.error.code : "unknown");
      return data as T;
    }
    throw new ApiError(401,"invalid_platform_token");
  };
}
