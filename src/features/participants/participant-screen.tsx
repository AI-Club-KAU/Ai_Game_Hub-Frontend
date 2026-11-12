"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, CheckCircle2, Gamepad2, LoaderCircle, LockKeyhole, Search, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EligibilityPanel } from "@/features/eligibility/eligibility-panel";
import { participantService, participantDemo, eligibilityDemo, resultDemo, leaderboardDemo } from "@/services";
import { normalizeIdentifier, validIdentifier, type Participant } from "@/services/participant-service";

import { LeaderboardScreen } from "@/features/leaderboard/leaderboard-screen";
import { GameContainer } from "@/features/games/game-container";
import type { GameAttempt } from "@/services/attempt-service";

type Mode = "new" | "existing";
type ErrorState = { message: string; field?: "name" | "identifier" };
export function ParticipantScreen({ onLock }: { onLock: () => void }) {
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [playing, setPlaying] = useState<GameAttempt | null>(null);
  const [mode, setMode] = useState<Mode>("new");
  const [fullName, setFullName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorState | null>(null);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [offline, setOffline] = useState(false);
  const inFlight = useRef(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const idRef = useRef<HTMLInputElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, [participant]);
  useEffect(() => { if (error?.field === "name") nameRef.current?.focus(); else if (error) idRef.current?.focus(); }, [error]);
  function clear(nextMode: Mode = "new") {
    eligibilityDemo.reset(); resultDemo.reset();
    setMode(nextMode); setFullName(""); setIdentifier(""); setParticipant(null); setError(null);
    setOffline(false); participantDemo?.setOffline(false);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    if (mode === "new" && !fullName.trim()) { setError({ message: "أدخل الاسم الكامل للمشارك.", field: "name" }); return; }
    const normalized = normalizeIdentifier(identifier);
    if (!validIdentifier(normalized)) { setError({ message: "أدخل رقمًا تعريفيًا مكوّنًا من أرقام فقط، دون مسافات أو رموز.", field: "identifier" }); return; }
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const result = mode === "new" ? await participantService.register({ identifier: normalized, fullName: fullName.trim() }) : await participantService.find(normalized);
      if (result.status === "success") { setParticipant(result.participant); setFullName(""); setIdentifier(""); }
      else setError({ message: result.message, field: "identifier" });
    } catch {
      setError({ message: "تعذّر الاتصال بالخدمة. لم نتأكد من إتمام العملية؛ حاول مرة أخرى." });
    } finally { inFlight.current = false; setBusy(false); }
  }
  if (showLeaderboard) return <LeaderboardScreen onReturn={() => { leaderboardDemo.reset(); setShowLeaderboard(false); }} />;
  if (playing) return <GameContainer attempt={playing} onReturn={() => setPlaying(null)} onComplete={() => { setPlaying(null); setBusy(false); clear(); }} />;
  return <main className="access-shell booth-shell">
    <header className="site-header"><div className="brand"><span className="brand-symbol"><Gamepad2 /></span><span><b dir="ltr">AI CLUB<span className="brand-dot">.</span></b><small>نادي الذكاء الاصطناعي</small></span></div><nav className="booth-navigation" aria-label="تنقل البوث">{!participant && <Button variant="outline" size="sm" disabled={busy} onClick={() => { clear(); leaderboardDemo.reset(); setShowLeaderboard(true); }}>لوحة المتصدرين</Button>}<Button variant="outline" size="sm" disabled={busy} onClick={() => { participantDemo?.setOffline(false); eligibilityDemo.reset(); onLock(); }}><LockKeyhole />قفل البوث</Button></nav></header>
    <section className="booth-content" aria-labelledby="booth-title">
      <div className="booth-intro"><p className="eyebrow"><span /> مساحة للتحدي والاكتشاف</p><h1 id="booth-title">كل تجربة تبدأ <span>بمشارك</span>.</h1><p>أهلًا بفريق البوث. جهّز بيانات المشارك، وابدأوا الرحلة معًا.</p><div className="booth-step"><Users /><span>بيانات المشارك</span><span className="version-badge">نسخة تجريبية</span></div></div>
      <div className="participant-card entry-card">
        {participant ? <>
          <div className="access-icon"><CheckCircle2 /></div><h2 ref={titleRef} tabIndex={-1}>{mode === "new" ? "تم تسجيل المشارك" : "تم استرجاع المشارك"}</h2>
          <p className="card-description">راجع البيانات وحالة المشاركة، ثم اختر اللعبة المتاحة.</p>
          <dl className="participant-details"><div><dt>الاسم الكامل</dt><dd>{participant.fullName}</dd></div><div><dt>الرقم التعريفي</dt><dd><bdi dir="ltr">{participant.identifier}</bdi></dd></div></dl>
          <p className="demo-result">تمت العملية في الذاكرة التجريبية فقط. لا توجد بيانات محفوظة على السيرفر.</p>
          <EligibilityPanel key={participant.identifier} participantIdentifier={participant.identifier} onLaunch={setPlaying} onBusy={setBusy} />
          <Button disabled={busy} className="w-full" onClick={() => clear()}>تجهيز مشارك آخر<ArrowLeft /></Button>
        </> : <>
          <div className="card-topline"><span className="step-label">تجهيز المشارك</span><span dir="ltr">02 / PARTICIPANT</span></div>
          <h2 ref={titleRef} tabIndex={-1}>البوث جاهز لاستقبالكم<span className="heading-dot">.</span></h2>
          <p className="card-description">يدخل عضو النادي بيانات المشارك في النموذج.</p>
          <div className="participant-modes" role="group" aria-label="نوع المشارك"><Button variant={mode === "new" ? "default" : "outline"} aria-pressed={mode === "new"} disabled={busy} onClick={() => clear("new")}><UserPlus />مشارك جديد</Button><Button variant={mode === "existing" ? "default" : "outline"} aria-pressed={mode === "existing"} disabled={busy} onClick={() => clear("existing")}><Search />مشارك سابق</Button></div>
          <form onSubmit={submit} noValidate aria-busy={busy}>
            <fieldset disabled={busy} className="participant-fields">
              {mode === "new" && <div><label className="field-label" htmlFor="participant-name">الاسم الكامل</label><Input ref={nameRef} id="participant-name" value={fullName} onChange={e => { setFullName(e.target.value); setError(null); }} autoComplete="off" aria-required="true" aria-invalid={error?.field === "name"} aria-describedby={error?.field === "name" ? "participant-error" : undefined} placeholder="أدخل الاسم الكامل" /></div>}
              <div><label className="field-label" htmlFor="participant-id">الرقم التعريفي</label><Input ref={idRef} id="participant-id" type="text" inputMode="numeric" dir="ltr" value={identifier} onChange={e => { setIdentifier(e.target.value); setError(null); }} autoComplete="off" aria-required="true" aria-invalid={error?.field === "identifier"} aria-describedby={error ? "identifier-help participant-error" : "identifier-help"} placeholder="مثال: 00123" /><p id="identifier-help" className="identifier-help">أرقام فقط؛ تُحفظ الأصفار في بداية الرقم.</p></div>
            </fieldset>
            <div className="participant-feedback" aria-live="polite">{error && <p id="participant-error" role="alert" className="error-message">{error.message}</p>}</div>
            <Button className="w-full" type="submit" disabled={busy}>{busy ? <><LoaderCircle className="animate-spin" />جارٍ تنفيذ الطلب…</> : <>{mode === "new" ? "تسجيل المشارك" : "استرجاع المشارك"}<ArrowLeft /></>}</Button>
            <Button className="w-full participant-clear" variant="ghost" type="button" disabled={busy} onClick={() => clear(mode)}>مسح البيانات</Button>
          </form>
        </>}
      </div>
      <aside className="participant-demo demo-note"><span className="demo-label">بيانات تجربة فقط</span><p>استرجع الرقم <code dir="ltr">00123</code> لعرض مشارك تجريبي، أو سجّل رقمًا جديدًا ثم استرجعه. تُحذف السجلات والمحاولات التجريبية عند تحديث الصفحة. قفل البوث يخفي بيانات المشارك ويحافظ على المحاولة في ذاكرة العرض.</p>{participantDemo && !participant && <label className="offline-control"><input type="checkbox" checked={offline} disabled={busy} onChange={e => { setOffline(e.target.checked); participantDemo.setOffline(e.target.checked); }} />محاكاة تعذّر الاتصال</label>}</aside>
    </section><footer className="site-footer"><span>نادي الذكاء الاصطناعي / نصنع التجربة معًا</span><span dir="ltr">AI CLUB GAMES HUB · DEV WEEK</span></footer>
  </main>;
}
