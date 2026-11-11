"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowUpLeft, Check, CheckCircle2, ChevronLeft, Eye, EyeOff, Fingerprint, Gamepad2, LoaderCircle, LockKeyhole, ShieldCheck, Sparkles, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { accessService } from "@/services";
import { AccessConnectionError } from "@/services/access-service";

import { ParticipantScreen } from "@/features/participants/participant-screen";

type State = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string; connection: boolean } | { kind: "success" };
export function AccessScreen() {
  const [booth, setBooth] = useState(false);
  const [code, setCode] = useState("");
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<State>({ kind: "idle" });
  const inFlight = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);
  const returning = useRef(false);
  useEffect(() => {
    if (state.kind === "success") successRef.current?.focus();
    if (state.kind === "error" || (state.kind === "idle" && returning.current)) {
      inputRef.current?.focus();
      returning.current = false;
    }
  }, [state.kind]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    if (!code.trim()) { setState({ kind: "error", message: "أدخل رمز الوصول أولًا.", connection: false }); inputRef.current?.focus(); return; }
    inFlight.current = true;
    setState({ kind: "loading" });
    try {
      const result = await accessService.verify(code);
      if (result.status === "verified") { setCode(""); setVisible(false); setState({ kind: "success" }); }
      else { setState({ kind: "error", message: result.message, connection: false }); inputRef.current?.focus(); }
    } catch (error) {
      setState({ kind: "error", message: error instanceof AccessConnectionError ? error.message : "تعذّر إكمال التحقق. حاول مرة أخرى.", connection: true });
    } finally { inFlight.current = false; }
  }
  function reset() { setBooth(false); returning.current = true; setCode(""); setVisible(false); setState({ kind: "idle" }); }
  const loading = state.kind === "loading";
  if (booth) return <ParticipantScreen onLock={reset} />;
  return (
    <main className="access-shell">
      <a href="#access-form" className="skip-link">انتقل إلى نموذج الوصول</a>
      <header className="site-header">
        <a href="/" className="brand" aria-label="منصة ألعاب نادي الذكاء الاصطناعي"><span className="brand-symbol" aria-hidden="true"><Gamepad2 size={25} /></span><span><b dir="ltr">AI CLUB<span className="brand-dot">.</span></b><small>نادي الذكاء الاصطناعي</small></span></a>
        <div className="header-event"><span className="status-dot" /><span dir="ltr">DEV WEEK</span><span className="event-divider" /><span>منصة الألعاب</span></div>
        <span className="version-badge"><span className="status-dot" />نسخة تجريبية</span>
      </header>
      <div className="main-grid">
        <section className="intro" aria-labelledby="intro-title">
          <div className="intro-copy"><p className="eyebrow"><span /> مساحة للتحدي والاكتشاف</p>
          <h1 id="intro-title">فكّر. العب.<br /><span>اترك بصمتك</span><span className="title-dot">.</span></h1>
          <p className="intro-description">تجارب تصنعها أقسام النادي، وتحديات تختبر مهاراتك.<br className="desktop-break" /> كل لعبة فرصة جديدة لتكتشف ما تقدر عليه.</p></div>
          <div className="orb-scene" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orb"><div className="orb-grid" /><Fingerprint className="orb-fingerprint" strokeWidth={0.8} /></div><span className="floating-chip chip-top"><Sparkles size={14} /> فضول يتحوّل إلى تجربة</span><span className="floating-chip chip-bottom"><span className="status-dot" /> جاهز للتحدي؟ <ArrowUpLeft size={14} /></span><span className="cross cross-one">+</span><span className="cross cross-two">+</span></div>
          <div className="event-facts"><div><strong>05</strong><span>أيام من التحدي</span></div><div><strong>05</strong><span>ألعاب من أقسامنا</span></div><div><strong>500</strong><span>نقطة تنتظرك</span></div></div>
        </section>
        <section className="entry-column" aria-label="وصول عضو النادي">
          <div className="entry-card" id="access-form">
            <div className="card-topline"><span className="step-label">بوابة البوث</span><span dir="ltr">01 / ACCESS</span></div>
            {state.kind === "success" ? <div className="success-panel" role="status" aria-live="polite"><div className="access-icon success-icon"><CheckCircle2 size={29} /></div><h2 ref={successRef} tabIndex={-1}>تم التحقق بنجاح</h2><p>شاشة الوصول جاهزة للتجربة.</p><div className="success-notice"><Check size={18} /><span>هذا تأكيد تجريبي فقط؛ لم تُنشأ جلسة دخول حقيقية.</span></div><p className="next-stage-note">اكتملت تجربة الوصول. يمكنك العودة لتجربة رمز آخر.</p><Button onClick={() => setBooth(true)} className="w-full mb-3">تجهيز البوث<ArrowLeft /></Button><Button variant="outline" onClick={reset} className="w-full">العودة لشاشة الوصول<ArrowLeft /></Button></div> : <>
            <div className="access-icon"><LockKeyhole size={27} strokeWidth={1.6} /></div>
            <h2>أهلًا بعضو النادي<span className="heading-dot">.</span></h2>
            <p className="card-description">أدخل رمز الوصول لتجهيز البوث<br />واستقبال المشاركين.</p>
            <form onSubmit={submit} noValidate aria-busy={loading}>
              <label htmlFor="access-code" className="field-label">رمز الوصول<span>خاص بأعضاء النادي</span></label>
              <div className="input-wrap"><Input ref={inputRef} id="access-code" name="access-code" type={visible ? "text" : "password"} value={code} onChange={e => { setCode(e.target.value); if (state.kind === "error") setState({ kind: "idle" }); }} placeholder="أدخل رمز الوصول" autoComplete="off" autoCapitalize="none" spellCheck={false} dir="ltr" disabled={loading} aria-required="true" aria-invalid={state.kind === "error"} aria-describedby={state.kind === "error" ? "access-error" : "access-help"} className="access-input" />
              <button className="visibility-toggle" type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "إخفاء رمز الوصول" : "إظهار رمز الوصول"} aria-pressed={visible} disabled={loading}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
              <div className="form-feedback" aria-live="polite" aria-atomic="true">{state.kind === "error" ? <p id="access-error" className="error-message" role="alert">{state.connection ? <WifiOff size={17} /> : <LockKeyhole size={17} />}<span>{state.message}</span></p> : <p id="access-help" className="input-hint"><ShieldCheck size={14} /> الوصول مخصص لفريق البوث</p>}</div>
              <Button type="submit" disabled={loading} className="entry-button w-full">{loading ? <><LoaderCircle className="animate-spin" /> جارٍ التحقق من الرمز…</> : <>{state.kind === "error" && state.connection ? "إعادة محاولة التحقق" : "الدخول إلى البوث"}<ArrowLeft /></>}</Button>
            </form>
            <div className="staff-note"><ShieldCheck size={19} /><p>يتولى عضو النادي تسجيل المشاركين،<br />ثم ينتقل التحكم للمشارك عند بدء اللعبة.</p></div>
            </>}
          </div>
          <aside className="demo-note" aria-label="تعليمات العرض التجريبي"><span className="demo-label">وضع العرض التجريبي</span><p>للتجربة: <code dir="ltr">demo</code> للنجاح، و<code dir="ltr">offline</code> لمحاكاة تعذّر الاتصال. أي رمز آخر يعرض خطأ.</p><span>الرموز هنا عامة للتجربة فقط.</span></aside>
        </section>
      </div>
      <footer className="site-footer"><span>نادي الذكاء الاصطناعي <span className="footer-separator">/</span> نصنع التجربة معًا</span><span dir="ltr">AI CLUB GAMES HUB <ChevronLeft size={13} /> DEV WEEK</span></footer>
    </main>
  );
}
