/** Frontend boundary only. Session and error contracts require agreement with Mada. */
export type AccessResult = { status: "verified" } | { status: "rejected"; message: string };
export interface AccessService { verify(code: string): Promise<AccessResult>; }
export class AccessConnectionError extends Error { constructor() { super("تعذّر الاتصال بخدمة التحقق التجريبية. حاول مرة أخرى."); this.name = "AccessConnectionError"; } }
