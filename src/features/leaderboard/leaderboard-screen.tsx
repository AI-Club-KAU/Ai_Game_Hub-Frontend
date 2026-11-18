
"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, RefreshCw, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { leaderboardService, gameLeaderboardService, leaderboardDemo, isMock } from "@/services";
import type { LeaderboardSnapshot } from "@/services/leaderboard-service";
import type { GameLeaderboardSnapshot, LeaderboardGameId } from "@/services/game-leaderboard-service";
import { MockHistoryConflict, MOCK_GAME_CATALOG, MOCK_MAX_POINTS } from "@/services/mock-game-catalog";

const tabs = [
  { id: "overall", label: "Overall" }, { id: "1", label: "ESCAPE.EXE" }, { id: "2", label: "Dev Run" },
  { id: "3", label: "وصّل طريقك" }, { id: "4", label: "Game 4" }, { id: "5", label: "Spot The AI" },
] as const;
type Tab = "overall" | LeaderboardGameId;
type Snapshot = { tab: "overall"; value: LeaderboardSnapshot } | { tab: LeaderboardGameId; value: GameLeaderboardSnapshot };
type BoardState = { tab: Tab; status: "loading" | "ready" | "error" | "unavailable"; snapshot: Snapshot | null; conflict: string };

export function LeaderboardScreen({ onReturn }: { onReturn: () => void }) {
  const [tab, setTab] = useState<Tab>("overall");
  const [board, setBoard] = useState<BoardState>({ tab: "overall", status: "loading", snapshot: null, conflict: "" });
  const [revision, setRevision] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const tabButtons = useRef<(HTMLButtonElement | null)[]>([]);
  // Never paint a previous tab's data while a new request is starting.
  const { status, snapshot, conflict } = board.tab === tab ? board : { status: "loading", snapshot: null, conflict: "" };
  const overall = tab === "overall";
  const rows = snapshot?.tab === "overall" ? snapshot.value.entries.map(e => ({ ...e, points: e.totalScore })) :
    snapshot?.value.entries.map(e => ({ ...e, points: e.score, gamesCompleted: undefined }));
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    let cancelled = false;
    setBoard({ tab, status: "loading", snapshot: null, conflict: "" });
    if (tab !== "overall" && gameLeaderboardService.availability === "awaiting-deployment") {
      setBoard({ tab, status: "unavailable", snapshot: null, conflict: "" });
      return () => { cancelled = true; };
    }
    const load = async (): Promise<Snapshot> => tab === "overall" ?
      { tab, value: await leaderboardService.load() } : { tab, value: await gameLeaderboardService.load(tab) };
    load().then(value => {
      if (!cancelled) setBoard({ tab, status: "ready", snapshot: value, conflict: "" });
    }).catch(error => { if (!cancelled) setBoard({ tab, status: "error", snapshot: null,
      conflict: isMock && error instanceof MockHistoryConflict ? error.message : "" }); });
    return () => { cancelled = true; };
  }, [revision, tab]);
  function refresh() { setBoard({ tab, status: "loading", snapshot: null, conflict: "" }); setRevision(value => value + 1); }
  return <main className="leaderboard-shell">
    <header className="leaderboard-toolbar"><span dir="ltr" className="leaderboard-brand">AI CLUB<span>.</span></span><Button variant="outline" onClick={onReturn}><ArrowRight />العودة إلى البوث</Button></header>
    <section className="leaderboard-content" aria-labelledby="leaderboard-title">
      <div className="leaderboard-intro"><Trophy aria-hidden="true" /><p className="eyebrow">كل تجربة تصنع فرقًا</p><h1 id="leaderboard-title" ref={heading} tabIndex={-1}>لوحة المتصدرين</h1><p>{overall ? "أفضل ثلاثة مشاركين حسب مجموع النقاط المعتمدة" : "أفضل عشرة مشاركين حسب نقاط اللعبة"}</p><span className="version-badge">{isMock ? "عرض تجريبي" : "ترتيب الخدمة"}</span></div>
      <div className="leaderboard-tabs" role="tablist" aria-label="لوحات المتصدرين">{tabs.map((item, index) => <button key={item.id}
        ref={node => { tabButtons.current[index] = node; }} type="button" role="tab" id={`leaderboard-tab-${item.id}`}
        aria-selected={tab === item.id} aria-controls="leaderboard-panel" tabIndex={tab === item.id ? 0 : -1}
        onClick={() => setTab(item.id)} onKeyDown={event => {
          // The page is RTL: Left advances visually, Right moves back.
          const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 :
            event.key === "ArrowLeft" ? (index + 1) % tabs.length : event.key === "ArrowRight" ? (index + tabs.length - 1) % tabs.length : -1;
          if (next >= 0) { event.preventDefault(); setTab(tabs[next].id); tabButtons.current[next]?.focus(); }
        }}>{item.label}</button>)}</div>
      {(tab === "4" || tab === "5") && <p className="leaderboard-scope-note">هذه اللعبة غير متاحة للعب في Live حاليًا؛ تبويب الترتيب لا يتيح تشغيلها.</p>}
      {isMock && !overall && <p className="leaderboard-scope-note">عرض تجريبي مستقل لترتيب الألعاب؛ لا تُحوّل نتائج QA المحفوظة إلى نتائج الألعاب الحقيقية.</p>}
      <div id="leaderboard-panel" role="tabpanel" tabIndex={0} aria-labelledby={`leaderboard-tab-${tab}`} className="leaderboard-results" aria-busy={status === "loading"}>
        {status === "loading" && <p className="leaderboard-notice" role="status">جارٍ تحميل المتصدرين…</p>}
        {status === "unavailable" && <div className="leaderboard-notice" role="status"><h2>ترتيب اللعبة غير متاح بعد</h2><p>بانتظار تأكيد نشر خدمة ترتيب الألعاب. لم يُرسل طلب إلى الخدمة.</p></div>}
        {status === "error" && <div className="leaderboard-notice" role="alert"><h2>{conflict ? "تعارض في بيانات المتصدرين" : "تعذّر تحميل المتصدرين"}</h2><p>{conflict || "لم نتمكن من التحقق من الترتيب الحالي. حاول التحديث مجددًا."}</p></div>}
        {status === "ready" && rows?.length === 0 && <div className="leaderboard-notice" role="status"><h2>{overall ? "البداية أمامكم" : "لا نتائج بعد"}</h2><p>{overall ? "لا توجد أسماء في قائمة المتصدرين حاليًا." : "لا توجد نتائج لهذه اللعبة حاليًا."}</p></div>}
        {status === "ready" && Boolean(rows?.length) && <ol className="leaderboard-list" aria-label={overall ? "أفضل ثلاثة مشاركين" : "أفضل عشرة مشاركين"}>{rows!.map((entry,index) =>
          <li className={entry.rank === 1 ? "leaderboard-row leader-first" : "leaderboard-row"} key={index}>
            <span className="leaderboard-rank" aria-label={"المركز " + entry.rank}>{entry.rank === 1 ? <Trophy aria-hidden="true" /> : null}{entry.rank}</span>
            <div className="leaderboard-name"><h2>{entry.displayName}</h2>{overall && <p>أكمل {entry.gamesCompleted} من {isMock ? MOCK_GAME_CATALOG.length : 5} ألعاب</p>}</div>
            <div className="leaderboard-points"><strong>{entry.points}</strong><span>نقطة من {overall ? (isMock ? MOCK_MAX_POINTS : 500) : 100}</span></div>
          </li>)}</ol>}
      </div>
      <div className="leaderboard-update"><Button variant="outline" disabled={status === "loading" || status === "unavailable"} onClick={refresh}><RefreshCw />{status === "error" ? "إعادة المحاولة" : "تحديث الترتيب"}</Button>{snapshot && <p>آخر تحديث: <time dateTime={snapshot.value.updatedAt}>{new Date(snapshot.value.updatedAt).toLocaleTimeString("ar-SA")}</time></p>}</div>
      {isMock && <details className="leaderboard-demo"><summary>إعدادات عرض المتصدرين التجريبية</summary><label>مصدر العرض<select aria-label="مصدر عرض المتصدرين" defaultValue={leaderboardDemo.getMode()} onChange={event => { leaderboardDemo.setMode(event.target.value as "saved" | "sample" | "empty" | "offline"); refresh(); }}><option value="saved">{overall ? "النتائج المحفوظة في هذه الجلسة" : "دون بيانات تجريبية لهذه اللعبة"}</option><option value="sample">{overall ? "مثال بثلاثة متصدرين وتعادل" : "مثال بعشرة متصدرين وتعادل"}</option><option value="empty">قائمة فارغة</option><option value="offline">تعذّر الاتصال</option></select></label><p>بيانات محاكاة في ذاكرة الصفحة. تُحذف عند تحديث الصفحة.</p></details>}
    </section>
  </main>;
}
