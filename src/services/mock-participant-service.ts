import { type Participant, type ParticipantService, normalizeIdentifier, validIdentifier } from "./participant-service";
/** Memory-only demo data: reset on reload, never stored in the browser. */
const records = new Map<string, Participant>();
let offline = false;
function reset() {
  records.clear();
  records.set("00123", { identifier: "00123", fullName: "مشارك تجريبي" });
  offline = false;
}
reset();
async function wait() {
  await new Promise(resolve => setTimeout(resolve, 800));
  if (offline) throw new Error("تعذّر الاتصال بالخدمة التجريبية. لم تكتمل العملية؛ حاول مرة أخرى.");
}
export const participantDemo = { setOffline(value: boolean) { offline = value; }, reset };
export const mockParticipantService: ParticipantService = {
  async register(input) {
    await wait();
    const identifier = normalizeIdentifier(input.identifier);
    const fullName = input.fullName.trim().replace(/\s+/g, " ");
    if (!validIdentifier(identifier) || !fullName) return { status: "invalid", message: "أدخل الاسم الكامل ورقمًا تعريفيًا مكوّنًا من أرقام فقط." };
    if (records.has(identifier)) return { status: "duplicate", message: "هذا الرقم مسجّل بالفعل. استخدم خيار مشارك سابق لاسترجاع بياناته." };
    const participant = { identifier, fullName };
    records.set(identifier, participant);
    return { status: "success", participant: { ...participant } };
  },
  async find(value) {
    await wait();
    const identifier = normalizeIdentifier(value);
    if (!validIdentifier(identifier)) return { status: "invalid", message: "أدخل رقمًا تعريفيًا مكوّنًا من أرقام فقط." };
    const participant = records.get(identifier);
    return participant ? { status: "success", participant: { ...participant } } : { status: "not-found", message: "لم نعثر على مشارك بهذا الرقم. راجع الرقم أو اختر مشارك جديد." };
  },
};

/** Internal mock lookup; identifiers never enter leaderboard responses. */
export function mockParticipantName(identifier: string) { return records.get(identifier)?.fullName ?? "مشارك تجريبي"; }
