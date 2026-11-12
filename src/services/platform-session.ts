
/** Memory only. Never expose the token to games, storage or logs. */
let token: string | null = null;
let expiresAt = 0;
let pending: Promise<void> | null = null;
let resolvePending: (() => void) | null = null;
let rejectPending: (() => void) | null = null;
const listeners = new Set<() => void>();
export const platformSession = {
  getToken: () => token && Date.now() < expiresAt ? token : null,
  needsRenewal: () => pending !== null,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  accept(value: string, seconds: number) {
    token = value; expiresAt = Date.now() + seconds * 1000;
    const resolve = resolvePending; pending = null; resolvePending = null; rejectPending = null;
    resolve?.(); listeners.forEach(listener => listener());
  },
  renew(): Promise<void> {
    if (pending) return pending;
    token = null; expiresAt = 0;
    pending = new Promise<void>((resolve,reject) => { resolvePending = resolve; rejectPending = () => reject(new Error("Session closed")); });
    const renewal = pending;
    listeners.forEach(listener => listener());
    return renewal;
  },
  clear() {
    token = null; expiresAt = 0;
    const reject = rejectPending; pending = null; resolvePending = null; rejectPending = null;
    reject?.(); listeners.forEach(listener => listener());
  },
};
