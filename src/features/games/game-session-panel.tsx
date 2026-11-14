"use client";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { attemptService, attemptDemo, isMock } from "@/services";
import { canLaunchGame } from "./game-assets";
import type { GameAttempt } from "@/services/attempt-service";
import type { BoothSection, EventDay, GameAvailability } from "@/services/eligibility-service";
import type { StartDemoMode } from "@/services/mock-attempt-service";

type Props = { participantIdentifier: string; game?: GameAvailability; context?: { day: EventDay | string; section: BoothSection | null }; onLaunch: (attempt: GameAttempt) => void; onBusy: (busy: boolean) => void; onRecovered: () => void };
export function GameSessionPanel({ participantIdentifier, game, context, onLaunch, onBusy, onRecovered }: Props) {
  const [status, setStatus] = useState<"checking" | "ready" | "starting" | "uncertain" | "active" | "rejected">("checking");
  const [activeAttempts, setActiveAttempts] = useState<GameAttempt[]>([]);
  const assetReady = !!game && canLaunchGame(game.id, isMock);
  async function loadActive() { if (attemptService.listActive) return attemptService.listActive(participantIdentifier); const found = await attemptService.inspect(participantIdentifier); return found ? [found] : []; }
  const [message, setMessage] = useState("");
  const [demoMode, setDemoMode] = useState<StartDemoMode>(attemptDemo.getMode);
  const flight = useRef(false);
  const requestId = useRef<string | null>(null);
  useEffect(() => { requestId.current = null; }, [game?.id, context?.day, context?.section]);
  useEffect(() => {
    let cancelled = false;
    onBusy(true);
    loadActive().then(found => {
      if (!cancelled) { setActiveAttempts(found); setStatus(found.length ? "active" : "ready"); }
    }).catch(() => { if (!cancelled) { setStatus("uncertain"); setMessage("تعذّر التحقق من حالة المحاولة. تحقّق منها قبل طلب البدء."); } }).finally(() => { if (!cancelled) onBusy(false); });
    return () => { cancelled = true; onBusy(false); };
  }, [participantIdentifier, onBusy]);
  async function inspect() {
    if (flight.current) return;
    flight.current = true; onBusy(true); setStatus("checking");
    try {
      const found = await loadActive();
      setActiveAttempts(found); setStatus(found.length ? "active" : "ready");
      if (found.length) onRecovered();
      setMessage(found.length ? "تم العثور على المحاولة؛ استأنفها دون طلب بدء جديد." : "لا توجد محاولة نشطة وفق الخدمة. يمكنك طلب البدء.");
    } catch { setStatus("uncertain"); setMessage("تعذّر التحقق من حالة المحاولة. لم نفترض نجاح البدء أو فشله."); }
    finally { flight.current = false; onBusy(false); }
  }
  async function start() {
    if (flight.current || !game?.eligible || !context || !["ready", "rejected", "active"].includes(status) || !assetReady) return;
    flight.current = true; onBusy(true); setStatus("starting"); setMessage("");
    requestId.current ??= crypto.randomUUID();
    try {
      const result = await attemptService.start({ requestId: requestId.current, participantIdentifier, gameId: game.id, day: context.day, section: context.section });
      if (result.status === "started") { setActiveAttempts([result.attempt]); setStatus("active"); onLaunch(result.attempt); }
      else { requestId.current = null; setStatus("rejected"); setMessage(result.message); }
    } catch { setStatus("uncertain"); setMessage("لم يصل تأكيد البدء. تحقّق من حالة المحاولة قبل إعادة الطلب لتجنّب التكرار."); }
    finally { flight.current = false; onBusy(false); }
  }
  async function resume(attempt: GameAttempt) {
    if (flight.current || !canLaunchGame(attempt.gameId, isMock)) return;
    flight.current = true; onBusy(true);
    try {
      const found = await loadActive();
      setActiveAttempts(found);
      const current = found.find(item => item.id === attempt.id && item.gameId === attempt.gameId);
      if (current) onLaunch(current);
      else { setStatus(found.length ? "active" : "ready"); setMessage("لم تعد هذه المحاولة نشطة. حدّث حالة المشارك."); onRecovered(); }
    } catch { setStatus("uncertain"); setMessage("تعذّر التحقق من حالة المحاولة. لم تبدأ جلسة لعب جديدة."); }
    finally { flight.current = false; onBusy(false); }
  }
  const busy = status === "checking" || status === "starting";
  return <section className="attempt-panel" aria-label="بدء المحاولة واستعادتها">
    {isMock && <details className="attempt-demo"><summary>محاكاة خدمة بدء المحاولة</summary><label>استجابة الخدمة<select aria-label="استجابة خدمة البدء" disabled={busy} value={demoMode} onChange={e => { const mode = e.target.value as StartDemoMode; setDemoMode(mode); attemptDemo.setMode(mode); }}><option value="normal">استجابة طبيعية</option><option value="offline">تعذّر الاتصال</option><option value="lost-response">حجز المحاولة ثم فقد الرد</option><option value="rejected">رفض البدء بعد إعادة التحقق</option></select></label><p>خيارات اختبار فقط. لا توجد جلسة أو محاولة على سيرفر فعلي.</p></details>}
    {message && <p className="attempt-message" role={status === "uncertain" || status === "rejected" ? "alert" : "status"}>{message}</p>}
    {busy && <p className="eligibility-loading" role="status"><LoaderCircle className="animate-spin" />{status === "starting" ? "جارٍ اعتماد بدء المحاولة…" : "جارٍ التحقق من حالة المحاولة…"}</p>}
    {status === "uncertain" && <Button variant="outline" onClick={inspect}><RefreshCw />التحقق من حالة المحاولة</Button>}
    {status === "active" && activeAttempts.map(attempt => <div className="active-attempt" key={attempt.id}><h4>للمشارك محاولة نشطة</h4><p>{attempt.gameTitle} · {attempt.day}</p><Button disabled={busy || !canLaunchGame(attempt.gameId, isMock)} onClick={() => void resume(attempt)}><Play />استئناف المحاولة</Button><p className="games-help">{isMock ? "الاستئناف يعيد فتح الحاوية بنفس المحاولة، دون حجز جديد." : "الاستئناف ينتظر تسليم ملفات اللعبة الحقيقية؛ لن تُشغّل صفحة اختبار بدل محاولتك."}</p></div>)}
    {(status === "ready" || status === "rejected" || status === "active") && game && context && <><Button className="w-full" disabled={!assetReady} onClick={start}><Play />ابدأ اللعب</Button><p className="games-help">{assetReady ? "يُحجز البدء بعد موافقة الخدمة، ثم يُسلّم الجهاز للمشارك." : "ملفات هذه اللعبة غير مضافة بعد؛ تم تعطيل البدء حتى لا تُستهلك فرصة المشارك على صفحة اختبار."}</p></>}
  </section>;
}
