import { AccessConnectionError, type AccessService } from "./access-service";
/** Public demo inputs, never production access credentials. No session is created. */
export const mockAccessService: AccessService = {
  async verify(code) {
    await new Promise(resolve => setTimeout(resolve, 1200));
    const value = code.trim();
    if (value.toLowerCase() === "offline") throw new AccessConnectionError();
    if (value === "demo") return { status: "verified" };
    return { status: "rejected", message: "رمز العرض التجريبي غير صحيح. تأكد من الرمز وحاول مرة أخرى." };
  },
};