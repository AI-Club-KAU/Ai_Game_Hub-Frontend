"use client";
import { useEffect, useRef, useState } from "react";
import { Gamepad2, HelpCircle, LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GameAttempt } from "@/services/attempt-service";
import { resultDemo, isMock } from "@/services";
import { ResultScreen } from "./result-screen";
import { getGameAsset } from "./game-assets";

export function GameContainer({ attempt, onReturn, onComplete }: { attempt: GameAttempt; onReturn: () => void; onComplete: () => void }) {
  const [finished, setFinished] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [revision, setRevision] = useState(0);
  const [source, setSource] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [help, setHelp] = useState(false);
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    if (finished) return;
    const abort = new AbortController();
    let cancelled = false;
    const nonce = crypto.randomUUID();
    setSource(null); setState("loading");
    const timer = setTimeout(() => { if (!cancelled) { setState("error"); setSource(null); abort.abort(); } }, 12000);
    function receive(event: MessageEvent) {
      // Opaque sandbox origin plus exact iframe source and nonce. This is only our local QA fixture's ready signal.
      if (event.source !== frame.current?.contentWindow || event.origin !== "null") return;
      const data: unknown = event.data;
      if (!data || typeof data !== "object") return;
      const value = data as Record<string, unknown>;
      if (value.type !== "ai-hub:container-check-ready" || value.version !== 0 || value.nonce !== nonce) return;
      if (!cancelled) { clearTimeout(timer); setState("ready"); }
    }
    window.addEventListener("message", receive);
    (async () => {
      try {
        const asset = getGameAsset(attempt.gameId);
        const response = await fetch(asset.entry, { signal: abort.signal, cache: "no-store" });
        if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) throw new Error("Unavailable game asset");
        if (!cancelled) setSource(asset.entry + "?nonce=" + encodeURIComponent(nonce));
      } catch { if (!cancelled) { clearTimeout(timer); setState("error"); setSource(null); } }
    })();
    return () => { cancelled = true; abort.abort(); clearTimeout(timer); window.removeEventListener("message", receive); };
  }, [attempt.id, attempt.gameId, revision, finished]);
  if (finished && isMock) return <ResultScreen request={{ attemptId: attempt.id, score: 80 }} onComplete={onComplete} />;
  return <main className="game-mode">
    <header className="game-mode-header"><div><Gamepad2 /><span><small>وضع اللعب · عرض تجريبي</small><h1 ref={heading} tabIndex={-1}>{attempt.gameTitle}</h1></span></div><Button variant="outline" onClick={() => setHelp(value => !value)} aria-expanded={help}><HelpCircle />طلب مساعدة</Button></header>
    {help && <section className="game-help" role="region" aria-label="مساعدة عضو النادي"><h2>أعد الجهاز إلى عضو النادي</h2><p>العودة للبوث لا تنهي المحاولة ولا تسجّل نتيجة. يمكن لعضو النادي استئناف نفس المحاولة.</p><Button onClick={onReturn}>العودة إلى شاشة الموظف</Button></section>}
    <div className="game-viewport" aria-busy={state === "loading"}>
      {state === "loading" && <p className="game-loading" role="status"><LoaderCircle className="animate-spin" />جارٍ تجهيز مساحة اللعب…</p>}
      {state === "error" && <div className="game-load-error" role="alert"><h2>تعذّر تحميل صفحة اللعبة</h2><p>المحاولة الحالية محفوظة في الذاكرة التجريبية. أعد تحميل الصفحة داخل الحاوية دون طلب بدء جديد.</p><Button onClick={() => setRevision(value => value + 1)}><RefreshCw />إعادة تحميل الحاوية</Button></div>}
      {source && <iframe ref={frame} title="حاوية اللعبة" src={source} sandbox="allow-scripts" referrerPolicy="no-referrer" allow="camera 'none'; microphone 'none'; geolocation 'none'" className={state === "ready" ? "game-frame" : "game-frame game-frame-pending"} />}
    </div>{isMock && <section className="result-demo"><details><summary>اختبار انتهاء المحاولة وحفظ النتيجة</summary><p>أداة عرض مؤقتة لعضو النادي؛ ليست نتيجة من لعبة حقيقية.</p><label>استجابة خدمة الحفظ<select aria-label="استجابة خدمة الحفظ" defaultValue={resultDemo.getMode()} onChange={event => resultDemo.setMode(event.target.value as "normal" | "offline" | "lost-response" | "rejected")}><option value="normal">طبيعي</option><option value="offline">تعذّر الاتصال</option><option value="lost-response">حفظ النتيجة وفقد الرد</option><option value="rejected">رفض النتيجة</option></select></label><Button disabled={state !== "ready"} onClick={() => setFinished(true)}>إنهاء تجريبي بنتيجة 80</Button></details></section>}<footer className="game-mode-footer"><span role="status">{state === "ready" ? "الحاوية جاهزة" : state === "error" ? "بانتظار استعادة التحميل" : "جارٍ التحميل"}</span><span>صفحة اختبار للحاوية فقط · لا توجد نقاط أو نتائج محفوظة</span></footer>
  </main>;
}
