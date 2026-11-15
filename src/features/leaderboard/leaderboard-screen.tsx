
"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, RefreshCw, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { leaderboardService, leaderboardDemo, isMock } from "@/services";
import type { LeaderboardSnapshot } from "@/services/leaderboard-service";
import { MockHistoryConflict, MOCK_GAME_CATALOG, MOCK_MAX_POINTS } from "@/services/mock-game-catalog";

export function LeaderboardScreen({ onReturn }: { onReturn: () => void }) {
  const [snapshot, setSnapshot] = useState<LeaderboardSnapshot | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [revision, setRevision] = useState(0);
  const [conflict, setConflict] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    let cancelled = false;
    setStatus("loading"); setSnapshot(null); setConflict("");
    leaderboardService.load().then(value => {
      if (!cancelled) { setSnapshot(value); setStatus("ready"); }
    }).catch(error => { if (!cancelled) { setStatus("error"); setConflict(isMock && error instanceof MockHistoryConflict ? error.message : ""); } });
    return () => { cancelled = true; };
  }, [revision]);
  function refresh() { setSnapshot(null); setStatus("loading"); setRevision(value => value + 1); }
  return <main className="leaderboard-shell">
    <header className="leaderboard-toolbar"><span dir="ltr" className="leaderboard-brand">AI CLUB<span>.</span></span><Button variant="outline" onClick={onReturn}><ArrowRight />العودة إلى البوث</Button></header>
    <section className="leaderboard-content" aria-labelledby="leaderboard-title">
      <div className="leaderboard-intro"><Trophy aria-hidden="true" /><p className="eyebrow">كل تجربة تصنع فرقًا</p><h1 id="leaderboard-title" ref={heading} tabIndex={-1}>لوحة المتصدرين</h1><p>أفضل ثلاثة مشاركين حسب مجموع النقاط المعتمدة</p><span className="version-badge">{isMock ? "عرض تجريبي" : "ترتيب الخدمة"}</span></div>
      <div className="leaderboard-results" aria-busy={status === "loading"}>
        {status === "loading" && <p className="leaderboard-notice" role="status">جارٍ تحميل المتصدرين…</p>}
        {status === "error" && <div className="leaderboard-notice" role="alert"><h2>{conflict ? "تعارض في بيانات المتصدرين" : "تعذّر تحميل المتصدرين"}</h2><p>{conflict || "لم نتمكن من التحقق من الترتيب الحالي. حاول التحديث مجددًا."}</p></div>}
        {status === "ready" && snapshot?.entries.length === 0 && <div className="leaderboard-notice" role="status"><h2>البداية أمامكم</h2><p>لا توجد أسماء في قائمة المتصدرين حاليًا.</p></div>}
        {status === "ready" && Boolean(snapshot?.entries.length) && <ol className="leaderboard-list" aria-label="أفضل ثلاثة مشاركين">{snapshot!.entries.map((entry,index) =>
          <li className={entry.rank === 1 ? "leaderboard-row leader-first" : "leaderboard-row"} key={index}>
            <span className="leaderboard-rank" aria-label={"المركز " + entry.rank}>{entry.rank === 1 ? <Trophy aria-hidden="true" /> : null}{entry.rank}</span>
            <div className="leaderboard-name"><h2>{entry.displayName}</h2><p>أكمل {entry.gamesCompleted} من {isMock ? MOCK_GAME_CATALOG.length : 5} ألعاب</p></div>
            <div className="leaderboard-points"><strong>{entry.totalScore}</strong><span>نقطة من {isMock ? MOCK_MAX_POINTS : 500}</span></div>
          </li>)}</ol>}
      </div>
      <div className="leaderboard-update"><Button variant="outline" disabled={status === "loading"} onClick={refresh}><RefreshCw />{status === "error" ? "إعادة المحاولة" : "تحديث الترتيب"}</Button>{snapshot && <p>آخر تحديث: <time dateTime={snapshot.updatedAt}>{new Date(snapshot.updatedAt).toLocaleTimeString("ar-SA")}</time></p>}</div>
      {isMock && <details className="leaderboard-demo"><summary>إعدادات عرض المتصدرين التجريبية</summary><label>مصدر العرض<select aria-label="مصدر عرض المتصدرين" defaultValue={leaderboardDemo.getMode()} onChange={event => { leaderboardDemo.setMode(event.target.value as "saved" | "sample" | "empty" | "offline"); refresh(); }}><option value="saved">النتائج المحفوظة في هذه الجلسة</option><option value="sample">مثال بثلاثة متصدرين وتعادل</option><option value="empty">قائمة فارغة</option><option value="offline">تعذّر الاتصال</option></select></label><p>بيانات محاكاة في ذاكرة الصفحة. تُحذف عند تحديث الصفحة.</p></details>}
    </section>
  </main>;
}
