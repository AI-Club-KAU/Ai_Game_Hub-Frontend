"use client";
import { useEffect, useRef, useState } from "react";
import { Gamepad2, HelpCircle, LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GameAttempt } from "@/services/attempt-service";
import { resultDemo, isMock } from "@/services";
import { ResultScreen } from "./result-screen";
import { canLaunchGame, getGameAsset } from "./game-assets";
import { escapeExeScore } from "./escape-exe-result";
import { devRunScore } from "./dev-run-result";
import type { ResultRequest } from "@/services/result-service";

export function GameContainer({ attempt, onReturn, onComplete }: { attempt: GameAttempt; onReturn: () => void; onComplete: () => void }) {
  const [finished, setFinished] = useState(false);
  const [gameResult, setGameResult] = useState<ResultRequest | null>(null);
  const accepted = useRef(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const loaded = useRef<() => void>(() => {});
  const asset = getGameAsset(attempt.gameId, isMock);
  const [revision, setRevision] = useState(0);
  const [source, setSource] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [help, setHelp] = useState(false);
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    if (finished) return;
    const currentAsset = getGameAsset(attempt.gameId, isMock);
    if (!currentAsset || !canLaunchGame(attempt.gameId, isMock)) { setSource(null); setState("error"); return; }
    const abort = new AbortController();
    let cancelled = false;
    const nonce = crypto.randomUUID();
    let channel: MessageChannel | null = null;
    let activeWindow: Window | null = null;
    let ready = false;
    setSource(null); setState("loading");
    const timer = setTimeout(() => { if (!cancelled) { setState("error"); setSource(null); abort.abort(); } }, 12000);
    loaded.current = () => {
      if (cancelled || (currentAsset.game !== "escape-exe" && currentAsset.game !== "dev-run") || channel) return;
      const devRun = currentAsset.game === "dev-run";
      activeWindow = frame.current?.contentWindow ?? null;
      if (!activeWindow) return;
      channel = new MessageChannel();
      channel.port1.onmessage = event => {
        if (!cancelled && event.data?.type === (devRun ? "ai-hub:dev-run-ready" : "ai-hub:escape-ready") && event.data.nonce === nonce &&
            (!devRun || (event.data.version === 1 && event.data.game === "dev-run"))) {
          ready = true; clearTimeout(timer); setState("ready");
        }
      };
      activeWindow.postMessage({ type: devRun ? "ai-hub:dev-run-init" : "ai-hub:escape-init", version: 1, game: currentAsset.game, nonce }, "*", [channel.port2]);
    };
    function receive(event: MessageEvent) {
      if (cancelled || accepted.current) return;
      if (currentAsset?.game === "escape-exe" || currentAsset?.game === "dev-run") {
        if (!ready || event.source !== activeWindow ||
            event.source !== frame.current?.contentWindow || event.origin !== "null") return;
        const score = currentAsset.game === "dev-run" ? devRunScore(event.data, nonce) : escapeExeScore(event.data, nonce);
        if (score === null) return;
        // Lock synchronously, before React updates or persistence starts.
        accepted.current = true;
        if (frame.current) { frame.current.inert = true; frame.current.tabIndex = -1; frame.current.blur(); }
        channel?.port1.postMessage(currentAsset.game === "dev-run" ? { type: "ai-hub:dev-run-lock", version: 1, game: "dev-run", nonce } : { type: "ai-hub:escape-lock", nonce });
        setHelp(false);
        setGameResult(Object.freeze({ attemptId: attempt.id, score }));
        return;
      }
      if (currentAsset?.readiness !== "container-check-v0") return;
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
        const response = await fetch(currentAsset.entry, { signal: abort.signal, cache: "no-store" });
        if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) throw new Error("Unavailable game asset");
        if (!cancelled) setSource(currentAsset.entry + "?nonce=" + encodeURIComponent(nonce));
      } catch { if (!cancelled) { clearTimeout(timer); setState("error"); setSource(null); } }
    })();
    return () => { cancelled = true; ready = false; activeWindow = null; channel?.port1.close(); channel?.port2.close(); loaded.current = () => {}; abort.abort(); clearTimeout(timer); window.removeEventListener("message", receive); };
  }, [attempt.id, attempt.gameId, revision, finished]);
  if (finished && isMock) return <ResultScreen request={{ attemptId: attempt.id, score: 80 }} onComplete={onComplete} />;
  return <main className="game-mode">
    <header className="game-mode-header"><div><Gamepad2 /><span><small>وضع اللعب · {isMock ? "عرض تجريبي" : "متصل بالخدمة"}</small><h1 ref={heading} tabIndex={-1}>{attempt.gameTitle}</h1></span></div><Button disabled={!!gameResult} variant="outline" onClick={() => { if (!accepted.current) setHelp(value => !value); }} aria-expanded={help}><HelpCircle />طلب مساعدة</Button></header>
    {help && <section className="game-help" role="region" aria-label="مساعدة عضو النادي"><h2>أعد الجهاز إلى عضو النادي</h2><p>العودة للبوث لا تنهي المحاولة ولا تسجّل نتيجة. يمكن لعضو النادي استئناف نفس المحاولة.</p><Button onClick={onReturn}>العودة إلى شاشة الموظف</Button></section>}
    {isMock && asset?.readiness === "load" && !gameResult && <label>استجابة خدمة الحفظ قبل النهاية<select aria-label="استجابة خدمة الحفظ قبل النهاية" defaultValue={resultDemo.getMode()} onChange={event => resultDemo.setMode(event.target.value as "normal" | "offline" | "lost-response" | "rejected")}><option value="normal">طبيعي</option><option value="offline">تعذّر الاتصال</option><option value="lost-response">حفظ النتيجة وفقد الرد</option><option value="rejected">رفض النتيجة</option></select></label>}
    <div className="game-viewport" aria-busy={state === "loading"}>
      {state === "loading" && <p className="game-loading" role="status"><LoaderCircle className="animate-spin" />جارٍ تجهيز مساحة اللعب…</p>}
      {state === "error" && <div className="game-load-error" role="alert"><h2>تعذّر تحميل صفحة اللعبة</h2><p>أعد تحميل اللعبة داخل الحاوية بنفس المحاولة، دون طلب بدء جديد.</p><Button onClick={() => setRevision(value => value + 1)}><RefreshCw />إعادة تحميل الحاوية</Button></div>}
      {source && <iframe key={`${attempt.id}:${revision}`} ref={frame} inert={!!gameResult} tabIndex={gameResult ? -1 : undefined} title="حاوية اللعبة" src={source} onLoad={() => loaded.current()} sandbox="allow-scripts" referrerPolicy="no-referrer" allow="camera 'none'; microphone 'none'; geolocation 'none'" className={state === "ready" ? "game-frame" : "game-frame game-frame-pending"} />}
      {gameResult && <div className="game-interaction-shield" aria-hidden="true" />}
    </div>{gameResult && asset?.readiness === "load" && <ResultScreen embedded request={gameResult} onComplete={onComplete} />}{isMock && asset?.readiness === "container-check-v0" && <section className="result-demo"><details><summary>اختبار انتهاء المحاولة وحفظ النتيجة</summary><p>أداة عرض مؤقتة لعضو النادي؛ ليست نتيجة من لعبة حقيقية.</p><label>استجابة خدمة الحفظ<select aria-label="استجابة خدمة الحفظ" defaultValue={resultDemo.getMode()} onChange={event => resultDemo.setMode(event.target.value as "normal" | "offline" | "lost-response" | "rejected")}><option value="normal">طبيعي</option><option value="offline">تعذّر الاتصال</option><option value="lost-response">حفظ النتيجة وفقد الرد</option><option value="rejected">رفض النتيجة</option></select></label><Button disabled={state !== "ready"} onClick={() => setFinished(true)}>إنهاء تجريبي بنتيجة 80</Button></details></section>}<footer className="game-mode-footer"><span role="status">{state === "ready" ? (asset?.readiness === "load" ? "تم تحميل صفحة اللعبة" : "الحاوية جاهزة") : state === "error" ? "بانتظار استعادة التحميل" : "جارٍ التحميل"}</span><span>{asset?.readiness === "load" ? (isMock ? `${asset?.game === "dev-run" ? "Dev Run" : "ESCAPE.EXE"} · نتائج محفوظة في Mock فقط` : `${asset?.game === "dev-run" ? "Dev Run" : "ESCAPE.EXE"} · حفظ النتيجة عبر الخدمة`) : "صفحة اختبار للحاوية فقط · لا توجد نقاط أو نتائج محفوظة"}</span></footer>
  </main>;
}
