export class ConfigurationError extends Error {
  constructor() {
    super("إعداد الاتصال غير صالح. حدّد NEXT_PUBLIC_API_MODE صراحةً بقيمة mock أو live، واضبط NEXT_PUBLIC_API_BASE_URL صالحًا عند اختيار live. لم يُرسل أي طلب إلى الخدمة.");
    this.name = "ConfigurationError";
  }
}

export function validateApiBaseUrl(base: string): string {
  try {
    const url = new URL(base);
    if (base !== base.trim() || !/^https?:\/\//.test(base) || base.includes("\\") || /\s/.test(base) ||
        (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) ||
        url.username || url.password || url.search || url.hash || /[?#]/.test(base) || /\/(?:\.|%2e){1,2}(?:\/|$)/i.test(base) ||
        url.pathname.split("/").some(segment => [".", ".."].includes(decodeURIComponent(segment)))) throw new ConfigurationError();
    // Keep the supplied destination; never substitute an environment or normalize it.
    return base;
  } catch {
    throw new ConfigurationError();
  }
}

export function readApiConfiguration(mode: string | undefined, base: string | undefined) {
  if (mode === "mock") return { isMock: true, apiBaseUrl: null, error: null } as const;
  if (mode === "live") {
    try {
      return { isMock: false, apiBaseUrl: validateApiBaseUrl(base ?? ""), error: null } as const;
    } catch { /* Return a safe UI error without exposing the supplied URL. */ }
  }
  return { isMock: false, apiBaseUrl: null, error: new ConfigurationError() } as const;
}
