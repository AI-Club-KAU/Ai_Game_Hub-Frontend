/** Frontend requirements only; not a final API contract. */
export type Participant = { identifier: string; fullName: string };
export type ParticipantResult =
  | { status: "success"; participant: Participant }
  | { status: "duplicate" | "not-found" | "invalid"; message: string };
export interface ParticipantService {
  register(participant: Participant): Promise<ParticipantResult>;
  find(identifier: string): Promise<ParticipantResult>;
}
export function normalizeIdentifier(value: string) {
  return value.trim().replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x6f0));
}
export function validIdentifier(value: string) { return /^[0-9]+$/.test(value); }
