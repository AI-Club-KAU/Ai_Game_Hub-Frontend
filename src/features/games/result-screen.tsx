"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { resultService, resultDemo, isMock } from "@/services";
import type { ResultRequest, SavedResult } from "@/services/result-service";
import { MockHistoryConflict } from "@/services/mock-game-catalog";

export function ResultScreen({ request, onComplete, embedded = false }: { request: ResultRequest; onComplete: () => void; embedded?: boolean }) {
  const [busy, setBusy] = useState(true);
  const [saved, setSaved] = useState<SavedResult | null>(null);
  const [message, setMessage] = useState("");
  const [remaining, setRemaining] = useState(10);
  const flight = useRef(false);
  const complete = useRef(onComplete);
  complete.current = onComplete;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [saved, message]);
  async function perform(inspect = false) {
    if (flight.current) return;
    flight.current = true; setBusy(true); setMessage("");
    try {
      if (inspect) {
        const result = await resultService.inspect(request.attemptId);
        if (result) setSaved(result);
        else setMessage("لم تُحفظ النتيجة بعد. يمكنك إعادة محاولة الحفظ لنفس المحاولة.");
      } else {
        const response = await resultService.save(request);
        if (response.status === "saved") setSaved(response.result);
        else setMessage(response.message);
      }
    } catch (error) { setMessage(isMock && error instanceof MockHistoryConflict ? error.message : "تعذّر تأكيد حفظ النتيجة. أعد الجهاز إلى عضو النادي لإعادة المحاولة أو التحقق من حالة الحفظ. لم نفترض نجاح العملية."); }
    finally { flight.current = false; setBusy(false); }
  }
  useEffect(() => { void perform(); }, []); // Same immutable request throughout retries.
  useEffect(() => {
    if (!saved) return;
    const deadline = Date.now() + 10000;
    const interval = setInterval(() => setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))), 200);
    const timeout = setTimeout(() => complete.current(), 10000);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [saved]);
  const Shell = embedded ? "section" : "main";
  return <Shell className={embedded ? "result-embedded" : "result-shell"} dir="rtl" aria-label={embedded ? "حالة حفظ نتيجة اللعبة" : undefined}><section className="result-card" aria-busy={busy}>
    <p className="eyebrow">نادي الذكاء الاصطناعي · {isMock ? "نتيجة تجريبية" : "نتيجة المشاركة"}</p>
    <h1 ref={heading} tabIndex={-1}>{saved ? "تم تأكيد حفظ النتيجة" : busy ? "جارٍ التحقق من حفظ النتيجة…" : "بانتظار تأكيد الحفظ"}</h1>
    {saved ? <><p>{saved.gameTitle}</p><p className="result-score" dir="ltr"><b>{saved.score}</b><span> / 100</span></p><p role="status">العودة إلى اختيار ألعابك خلال {remaining} ثوانٍ</p></> : <>
      <p>لن تبدأ العودة التلقائية حتى تؤكد الخدمة حفظ النتيجة.</p>
      {message && <p role="alert" className="error-message">{message}</p>}
      <div className="result-actions"><Button disabled={busy} onClick={() => void perform()}>إعادة محاولة الحفظ</Button><Button disabled={busy} variant="outline" onClick={() => void perform(true)}>التحقق من حالة الحفظ</Button></div>
      {isMock && <details><summary>محاكاة خدمة حفظ النتيجة</summary><label>استجابة خدمة الحفظ<select aria-label="استجابة خدمة الحفظ" disabled={busy} defaultValue={resultDemo.getMode()} onChange={event => resultDemo.setMode(event.target.value as "normal" | "offline" | "lost-response" | "rejected")}><option value="normal">طبيعي</option><option value="offline">تعذّر الاتصال</option><option value="lost-response">حفظ النتيجة وفقد الرد</option><option value="rejected">رفض النتيجة</option></select></label></details>}
    </>}
    {isMock && <small>محاكاة في ذاكرة الصفحة فقط؛ تحديث الصفحة يمسح البيانات التجريبية.</small>}
  </section></Shell>;
}
