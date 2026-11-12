"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Gamepad2, LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { eligibilityService, eligibilityDemo, isMock } from "@/services";
import type { EligibilitySnapshot, EventDay, BoothSection } from "@/services/eligibility-service";
import type { DemoHistory, EligibilityDemoConfig } from "@/services/mock-eligibility-service";

import { GameSessionPanel } from "@/features/games/game-session-panel";
import type { GameAttempt } from "@/services/attempt-service";

type LoadState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: EligibilitySnapshot };
export function EligibilityPanel({ participantIdentifier, onLaunch, onBusy }: { participantIdentifier: string; onLaunch: (attempt: GameAttempt) => void; onBusy: (busy: boolean) => void }) {
  const [launchPending, setLaunchPending] = useState(false);
  const handlePending = useCallback((value: boolean) => { setLaunchPending(value); onBusy(value); }, [onBusy]);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [config, setConfig] = useState(() => eligibilityDemo.getConfig());
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    let cancelled = false;
    eligibilityService.load(participantIdentifier).then(data => {
      if (!cancelled && current === generation.current) setState({ kind: "ready", data });
    }).catch(() => {
      if (!cancelled && current === generation.current) setState({ kind: "error" });
    });
    return () => { cancelled = true; };
  }, [participantIdentifier, revision]);
  function reload(next?: EligibilityDemoConfig) {
    generation.current += 1;
    if (next) { setConfig(next); eligibilityDemo.configure(next); }
    setSelected(null); setConfirmed(false); setState({ kind: "loading" }); setRevision(value => value + 1);
  }
  function change(patch: Partial<EligibilityDemoConfig>) {
    const next = { ...config, ...patch };
    if (patch.history === "complete") next.day = 5;
    if (patch.day && patch.day < 5 && next.history === "complete") next.history = "new";
    if (next.day === 1 && ["previous", "repeated"].includes(next.history)) next.history = "new";
    reload(next);
  }
  const data = state.kind === "ready" ? state.data : null;
  const selectedGame = data?.games.find(game => game.id === selected && game.eligible);
  return <section className="eligibility-panel" aria-labelledby="eligibility-title"><fieldset className="eligibility-controls" disabled={launchPending}>
    <div className="eligibility-heading"><div><p className="eyebrow">03 / حالة المشاركة</p><h3 id="eligibility-title">خطوتك التالية، تحدٍّ جديد</h3></div><Button variant="outline" size="sm" onClick={() => reload()} disabled={state.kind === "loading"}><RefreshCw />تحديث الحالة</Button></div>
    {isMock && <details className="eligibility-demo"><summary>إعدادات العرض التجريبي</summary><p>اليوم الثالث استثنائي في هذا المثال فقط. أسماء الألعاب والجدول والنتائج افتراضية، وليست بيانات الفعالية المعتمدة.</p><div className="demo-selects">
      <label>يوم التجربة<select aria-label="يوم التجربة" value={config.day} onChange={e => change({ day: Number(e.target.value) as EventDay })}>{[1,2,3,4,5].map(day => <option key={day} value={day}>اليوم {day}</option>)}</select></label>
      <label>قسم التجربة<select aria-label="قسم التجربة" value={config.section} onChange={e => change({ section: e.target.value as BoothSection })}><option value="students">الطلاب</option><option value="female-students">الطالبات</option></select></label>
      <label>سجل تجريبي<select aria-label="سجل تجريبي" value={config.history} onChange={e => change({ history: e.target.value as DemoHistory })}><option value="new">بدون مشاركات</option><option value="previous" disabled={config.day === 1}>نتيجة سابقة معتمدة</option><option value="played-today">شارك اليوم</option><option value="repeated" disabled={config.day === 1}>أكمل لعبة اليوم سابقًا</option><option value="active">محاولة قيد التنفيذ</option><option value="complete">أكمل الألعاب الخمس</option></select></label>
    </div><label className="offline-control"><input type="checkbox" checked={config.offline} onChange={e => change({ offline: e.target.checked })} />محاكاة تعذّر تحميل الأهلية</label></details>}
    {state.kind === "loading" && <p className="eligibility-loading" role="status"><LoaderCircle className="animate-spin" />جارٍ التحقق من الأهلية والنتائج…</p>}
    {state.kind === "error" && <div className="eligibility-error"><p role="alert">تعذّر تحميل حالة المشارك. لا يمكن تحديد الألعاب المسموحة حتى ينجح التحقق.</p><Button variant="outline" onClick={() => reload()}>إعادة تحميل الأهلية</Button></div>}
    {data && <>
      {!isMock && <p className="games-help">الربط قيد التجهيز: جدول الأقسام وملفات الألعاب لم تُعتمد بعد. لا تبدأ محاولة فعلية قبل اكتمال تجهيز اللعبة.</p>}
      <div className="eligibility-context"><span>{isMock ? "اليوم " : "تاريخ الرياض: "}{data.day}{data.section ? " · " + (data.section === "students" ? "الطلاب" : "الطالبات") : ""}</span><span className="version-badge">{isMock ? "بيانات تجريبية" : "بيانات الخدمة"}</span></div>
      <p className={data.status === "eligible" ? "eligibility-status eligible" : "eligibility-status"} role="status">{data.message}</p>
      <div className="progress-stats"><div><strong>{data.totalScore}<small> / 500</small></strong><span>مجموع النتائج المعتمدة</span></div><div><strong>{data.results.length}<small> / 5</small></strong><span>ألعاب مكتملة · الإكمال اختياري</span></div></div>
      <h4>الألعاب وحالة إتاحتها</h4><p className="games-help">100 نقطة كحد أقصى لكل لعبة. يمكنك اختيار لعبة واحدة فقط.</p>
      <fieldset className="game-choices"><legend className="sr-only">اختر اللعبة المتاحة</legend>{data.games.map(game => <label key={game.id} className={"game-choice " + (game.eligible ? "available " : "unavailable ") + (selected === game.id ? "selected" : "")}><input type="radio" name="eligible-game" value={game.id} checked={selected === game.id} disabled={!game.eligible || confirmed} onChange={() => { setSelected(game.id); setConfirmed(false); }} aria-describedby={"reason-" + game.id} /><Gamepad2 aria-hidden="true" /><span><strong>{game.title}</strong><small id={"reason-" + game.id}>{game.reason}</small></span><span className="game-score">{game.maxScore}<small>نقطة</small></span></label>)}</fieldset>
      {selectedGame && <div className="selection-review"><h4>مراجعة اختيار عضو النادي</h4><p>{selectedGame.title} · {isMock ? "اليوم " : ""}{data.day}{data.section ? " · " + (data.section === "students" ? "الطلاب" : "الطالبات") : ""}</p>{confirmed ? <><p className="selection-confirmed" role="status"><CheckCircle2 />تم تأكيد الاختيار فقط. لم تُحجز محاولة ولم تبدأ اللعبة.</p><Button variant="outline" onClick={() => { setConfirmed(false); setSelected(null); }}>تغيير الاختيار</Button></> : <Button onClick={() => setConfirmed(true)}>تأكيد اختيار اللعبة</Button>}<p className="games-help">بعد مراجعة الاختيار، يطلب عضو النادي اعتماد البدء.</p></div>}
      <div className="previous-results"><h4>النتائج السابقة المعتمدة</h4>{data.results.length ? <ul>{data.results.map(result => <li key={result.gameId}><span>{result.gameTitle}<small>{isMock ? "اليوم " : ""}{result.day}</small></span><strong>{result.score} / 100</strong></li>)}</ul> : <p>لا توجد نتائج معتمدة للمشارك حتى الآن.</p>}</div>
    </>}
  </fieldset>
    <GameSessionPanel participantIdentifier={participantIdentifier} game={confirmed ? selectedGame : undefined} context={data ? { day: data.day, section: data.section } : undefined} onLaunch={onLaunch} onBusy={handlePending} onRecovered={() => reload()} />
  </section>;
}
