/* =========================================================
   وصّل طريقك — لعبة بوث AIClub · Dev Week
   منطق اللعبة: الشبكة، الأسئلة، المؤقت، النتيجة ولوحة الأبطال
   ========================================================= */
"use strict";
// Deployed platform-only copy: Google synchronization is disabled before initialization.
const PLATFORM_COPY = true;
const Platform = (() => {
  let port = null, nonce = null, completed = false, ending = false, generation = 0;
  const lock = () => { document.body.inert = true; document.activeElement?.blur?.(); };
  window.addEventListener("message", event => {
    const d = event.data;
    if (parent === window || event.source !== parent || event.origin !== location.origin || port ||
        !d || typeof d !== "object" || Array.isArray(d) || d.type !== "ai-hub:wassel-tareeqak-init" ||
        d.version !== 1 || d.game !== "wassel-tareeqak" || typeof d.nonce !== "string" ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(d.nonce) ||
        d.nonce !== new URLSearchParams(location.search).get("nonce") ||
        event.ports.length !== 1 || !(event.ports[0] instanceof MessagePort)) return;
    port = event.ports[0]; nonce = d.nonce;
    port.onmessage = event => {
      const v = event.data;
      if (completed && v?.type === "ai-hub:wassel-tareeqak-lock" && v.version === 1 &&
          v.game === "wassel-tareeqak" && v.nonce === nonce) lock();
    };
    document.querySelector('#startForm button[type="submit"]').disabled = false;
    port.postMessage({type:"ai-hub:wassel-tareeqak-ready",version:1,game:"wassel-tareeqak",nonce});
  });
  return Object.freeze({
    ready: () => !!port,
    completed: () => completed || ending,
    beginEnding: () => { ending = true; },
    generation: () => generation,
    interrupt: () => { generation++; },
    report(result, rawElapsedTime, reason) {
      if (!port || completed) return;
      completed = true;
      parent.postMessage({type:"wassel-tareeqak:result",version:1,game:"wassel-tareeqak",nonce,
        score:result.score,maxScore:100,rawElapsedTime,correct:result.correct,wrong:result.wrong,
        reached:result.win,reason}, location.origin);
      lock(); // Do not stop the original delayed ending animation.
    }
  });
})();

/* ---------------- الإعدادات ---------------- */
const CONFIG = {
  GAME_SECONDS: 120,       // مدة الجولة (دقيقتين)
  COLS: 7,                 // عدد أعمدة الشبكة
  ROWS: 5,                 // عدد صفوف الشبكة
  FEEDBACK_MS: 850,        // مدة عرض صح/غلط قبل ما يرجع اللاعب للشبكة
  WARN_AT: 15,             // متى يصير المؤقت أحمر (ثواني)
  RESULT_IDLE_SECONDS: 25, // يرجع لشاشة البداية تلقائيًا بعد النتيجة
  STORAGE_KEY: "aiclub_wasel_leaderboard_v2", // v2 = بالنقاط (اللوحة القديمة بالوقت ما تنقرأ)

  // ----- حسبة النقاط (المجموع من 100) -----
  POINTS_PER_CORRECT: 10,  // كل إجابة صح
  MAX_ANSWER_POINTS: 70,   // سقف الإجابات = أقصر طريق (7 خلايا × 10)
  REACH_POINTS: 10,        // الوصول لـ🏁
  SPEED_POINTS: 20,        // السرعة (للي وصل بس)
  FULL_SPEED_SECONDS: 40,  // اللي يوصل في 40 ثانية أو أقل ياخذ السرعة كاملة
};

/* ---------------- الربط مع النظام المركزي للألعاب (Game Container) ----------------
   - بعد كل جولة، لو اللعبة داخل النظام (iframe)، ترسل له النتيجة: { type, playerId, score, ... }
     عن طريق postMessage. النظام يعرف أصلًا مين اللاعب، فالمعرّف مو شرط.
   - اختياري: لو النظام مرّر معرّف أو اسم في الرابط (.../?pid=XYZ&name=ريم) نرجّعه معه.
   - لو اللعبة منفتحة لحالها (مو داخل النظام) تشتغل عادي وما ترسل شي.
   طريقة الإرسال ممكن تتغيّر حسب ما يطلبه فريق النظام. */
const INTEGRATION = {
  ID_PARAMS: ["pid", "playerId", "player_id", "id"],   // أسماء مقبولة لمعرّف اللاعب في الرابط
  NAME_PARAMS: ["name", "playerName", "player_name"],  // اسم اللاعب (اختياري)
  MESSAGE_TYPE: "wassel-tareeqak:result",
  // لما يعطونا رابط النظام نحطه هنا بدل "*" (مثلًا "https://games.aiclub.example")
  TARGET_ORIGIN: "*",
};

const Integration = {
  init() {},
  report(result, rawElapsedTime, reason) { Platform.report(result, rawElapsedTime, reason); },
};

/* النقاط من 100:
   الإجابات الصح: 10 لكل وحدة، وأقصى شي 70
   + الوصول: 10
   + السرعة (للي وصل): 20 كاملة لو وصل في 40 ثانية أو أقل،
     وبعدها تنقص بالتساوي لين صفر عند نهاية الوقت (كل 4 ثواني = نقطة) */
function computeScore(win, time, correct) {
  const answers = Math.min(CONFIG.MAX_ANSWER_POINTS, correct * CONFIG.POINTS_PER_CORRECT);
  if (!win) return answers;
  const secPerPoint = (CONFIG.GAME_SECONDS - CONFIG.FULL_SPEED_SECONDS) / CONFIG.SPEED_POINTS;
  const speed = Math.max(0, Math.min(CONFIG.SPEED_POINTS, (CONFIG.GAME_SECONDS - time) / secPerPoint));
  // نقرّب لتحت (floor): الـ100 بس للي وصل في 40 ثانية أو أقل، و41.3 ثانية = 99
  return Math.floor(answers + CONFIG.REACH_POINTS + speed);
}

/* التصنيفات والأسئلة في questions.js */

/* ---------------- أدوات مساعدة ---------------- */
const $ = (id) => document.getElementById(id);
const rand = (n) => Math.floor(Math.random() * n);
const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const fmtClock = (sec) => {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const fmtTime = (sec) => `${sec.toFixed(1)} ث`;

/* ---------------- الأصوات ----------------
   كل الأصوات تنفك مرة وحدة أول ما تفتح الصفحة (Web Audio)، فتشتغل فورًا لحظة الطلب
   بدون تأخير. لو المتصفح ما يدعم Web Audio نرجع لعناصر <audio> العادية. */
const Sound = {
  muted: false,
  ctx: null,
  buffers: {},
  init() {
    try { this.muted = localStorage.getItem("aiclub_wasel_muted") === "1"; } catch (e) {}
    this.render();

    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC && window.SOUND_DATA) {
      try {
        this.ctx = new AC({ latencyHint: "interactive" });
        Object.entries(window.SOUND_DATA).forEach(([name, b64]) => {
          const bin = atob(b64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const done = (buf) => { this.buffers[name] = buf; };
          const p = this.ctx.decodeAudioData(bytes.buffer, done, () => {});
          if (p && p.catch) p.catch(() => {});
        });
      } catch (e) { this.ctx = null; }
    }
    // المتصفحات تقفل الصوت لين أول لمسة/ضغطة: نفتحه أول ما يتفاعل أحد مع الصفحة
    const unlock = () => this.unlock();
    ["pointerdown", "keydown", "touchstart"].forEach((ev) =>
      document.addEventListener(ev, unlock, { passive: true, capture: true }));
  },
  unlock() {
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
  },
  play(name) {
    if (this.muted) return;
    const buf = this.buffers[name];
    if (this.ctx && buf) {
      try {
        if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.connect(this.ctx.destination);
        src.start(0);
        return;
      } catch (e) { /* نكمل بالطريقة الاحتياطية */ }
    }
    const el = $("snd" + name);
    if (!el) return;
    try {
      const node = el.cloneNode();
      node.volume = el.volume;
      const p = node.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {}
  },
  toggle() {
    this.muted = !this.muted;
    try { localStorage.setItem("aiclub_wasel_muted", this.muted ? "1" : "0"); } catch (e) {}
    this.render();
  },
  render() { $("btnSound").textContent = this.muted ? "🔇" : "🔊"; },
};

/* ---------------- لوحة الأبطال (تنحفظ على جهاز البوث) ---------------- */
const Leaderboard = {
  load() {
    try {
      if (PLATFORM_COPY) return memoryBoard;
      const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) { return memoryBoard; }
  },
  save(list) {
    memoryBoard = list;
    if (PLATFORM_COPY) return;
    try { localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(list)); } catch (e) {}
  },
  sort(list) {
    // الترتيب: النقاط الأعلى ← الأسرع ← أقل خلايا مفتوحة (صح + غلط: وصل بأسئلة أقل)
    //          ← الأقل أخطاء ← اللي لعب أول
    // الوقت يُقارن بس بين اللي وصلوا (اللي ما وصل: انسداد طريقه بدري مو «سرعة»)
    const opened = (e) => (e.correct || 0) + (e.wrong || 0);
    const time = (a, b) => (a.win && b.win ? a.time - b.time : 0);
    return list.sort((a, b) =>
      b.score - a.score || time(a, b) || opened(a) - opened(b) || a.wrong - b.wrong || a.at - b.at);
  },
  add(entry) {
    const list = this.sort(this.load().concat(entry));
    this.save(list);
    if (!PLATFORM_COPY) Shared.push(entry); // لو فيه شيت (config.js): نرسل النتيجة للوحة المشتركة
    return list.findIndex((e) => e.id === entry.id);
  },
  clear() { this.save([]); },
  // كل الأسماء تظهر، واللوحة تنزل لتحت (scroll) لو كثرت
  render(el, highlightId) {
    const list = this.load();
    el.innerHTML = "";
    if (!list.length) {
      const li = document.createElement("li");
      li.className = "lb-empty";
      li.textContent = "ما فيه أبطال للحين… كن الأول! 🚀";
      el.appendChild(li);
      return;
    }
    let mine = null;
    list.forEach((e) => {
      const li = this.row(e, e.id === highlightId);
      if (e.id === highlightId) mine = li;
      el.appendChild(li);
    });
    // اللاعب الحالي: ننزل له في اللوحة عشان يشوف مركزه
    if (mine) requestAnimationFrame(() => {
      el.scrollTop = Math.max(0, mine.offsetTop - el.offsetTop - el.clientHeight / 2 + mine.offsetHeight / 2);
    });
    else el.scrollTop = 0;
  },
  row(e, me) {
    const li = document.createElement("li");
    if (me) li.classList.add("me");
    const n = document.createElement("span"); n.className = "lb-name"; n.textContent = e.name;
    if (e.win) {
      const s = document.createElement("small"); s.className = "lb-sub"; s.textContent = fmtTime(e.time);
      n.append(" ", s);
    }
    const t = document.createElement("span"); t.className = "lb-time"; t.textContent = String(e.score);
    li.append(n, t);
    return li;
  },
};
let memoryBoard = [];

/* ---------------- لوحة الأبطال المشتركة (قوقل شيت) ----------------
   تشتغل لو config.js فيه sheetUrl — في الرابط الخاص وفي النظام: لوحة وحدة لكل اللي لعبوا.
   بدون config.js تبقى اللوحة على الجهاز.
   - كل نتيجة تنحفظ أول في «صندوق صادر» على الجهاز وتنرسل للشيت، ولو فشلت نعيد المحاولة.
   - اللوحة تتحدّث من الشيت كل شوي، فتطلع نتائج كل الأجهزة. */
const SHEET_URL = ((window.WASSEL_CONFIG || {}).sheetUrl || "").trim();
const OUTBOX_KEY = "aiclub_wasel_outbox_v1";

const Shared = {
  on: !PLATFORM_COPY && !!SHEET_URL,
  sending: false,
  outbox() {
    try { const l = JSON.parse(localStorage.getItem(OUTBOX_KEY) || "[]"); return Array.isArray(l) ? l : []; } catch (e) { return []; }
  },
  setOutbox(l) { try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(l)); } catch (e) {} },

  push(entry) {
    if (PLATFORM_COPY || !this.on) return;
    this.setOutbox(this.outbox().concat(entry));
    this.flush();
  },

  async flush() {
    if (PLATFORM_COPY || !this.on || this.sending) return;
    this.sending = true;
    try {
      let box = this.outbox();
      while (box.length) {
        const e = box[0];
        try {
          await fetch(SHEET_URL, {
            method: "POST", mode: "no-cors",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(e),
          });
        } catch (err) { break; } // النت فاصل: نكمل بعدين
        box = this.outbox().filter((x) => x.id !== e.id);
        this.setOutbox(box);
      }
    } finally {
      this.sending = false;
      if (this.outbox().length) setTimeout(() => this.flush(), 10000); // باقي شي ما انرسل
      setTimeout(() => this.pull(), 2500);
    }
  },

  // نجيب كل النتائج من الشيت ونحطها في اللوحة (مع اللي لسا ما انرسل)
  async pull() {
    if (PLATFORM_COPY || !this.on) return;
    try {
      const res = await fetch(SHEET_URL + (SHEET_URL.includes("?") ? "&" : "?") + "t=" + Date.now(), { cache: "no-store" });
      const data = await res.json();
      const remote = Array.isArray(data.entries) ? data.entries : [];
      const ids = new Set(remote.map((e) => e.id));
      const pending = this.outbox().filter((e) => !ids.has(e.id));
      Leaderboard.save(Leaderboard.sort(remote.concat(pending)));
      Leaderboard.render($("lbStart"));
      if ($("screenResult").classList.contains("active")) Leaderboard.render($("lbResult"), state.lastEntryId);
    } catch (e) { /* نخلي اللي عندنا لين يرجع النت */ }
  },

  start() {
    if (PLATFORM_COPY || !this.on) return;
    this.flush();
    window.addEventListener("online", () => this.flush());
    this.pull();
    setInterval(() => { if ($("screenStart").classList.contains("active")) this.pull(); }, 20000);
  },
};

/* ---------------- الشبكة السداسية ---------------- */
const R = 60;                       // نصف قطر الخلية (من المركز للرأس)
const HEX_W = Math.sqrt(3) * R;     // عرض الخلية
const ROW_H = 1.5 * R;              // المسافة العمودية بين الصفوف
const SVG_NS = "http://www.w3.org/2000/svg";

const key = (r, c) => `${r},${c}`;

function neighbors(r, c) {
  // شبكة "odd-r": الصفوف الفردية مزاحة لليمين بنص خلية
  const odd = r % 2 === 1;
  const d = odd
    ? [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]]
    : [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]];
  return d
    .map(([dr, dc]) => [r + dr, c + dc])
    .filter(([rr, cc]) => rr >= 0 && rr < CONFIG.ROWS && cc >= 0 && cc < CONFIG.COLS);
}

function cellCenter(r, c) {
  return {
    x: HEX_W / 2 + c * HEX_W + (r % 2 ? HEX_W / 2 : 0) + 8,
    y: R + r * ROW_H + 8,
  };
}

function hexPoints(cx, cy, rad) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const ang = (Math.PI / 180) * (60 * i - 90); // رأس للأعلى
    pts.push(`${(cx + rad * Math.cos(ang)).toFixed(1)},${(cy + rad * Math.sin(ang)).toFixed(1)}`);
  }
  return pts.join(" ");
}

function bfsDistance(from, to, passable) {
  const q = [[...from, 0]];
  const seen = new Set([key(...from)]);
  while (q.length) {
    const [r, c, d] = q.shift();
    if (r === to[0] && c === to[1]) return d;
    for (const [nr, nc] of neighbors(r, c)) {
      const k = key(nr, nc);
      if (seen.has(k) || !passable(nr, nc)) continue;
      seen.add(k);
      q.push([nr, nc, d + 1]);
    }
  }
  return Infinity;
}

/* ---------------- حالة اللعبة ---------------- */
const state = {
  player: "",
  cells: new Map(),   // key -> { r, c, status, question, icon, g }
  start: null,
  finish: null,
  active: null,       // الخلية اللي سؤالها مفتوح
  busy: false,
  running: false,
  startTime: 0,
  rafId: 0,
  lastTickSec: null,
  correct: 0,
  wrong: 0,
  resultTimer: 0,
};

/* ---------------- توزيع الأسئلة على الشبكة ----------------
   - كل مجال يطلع مرتين في الشبكة (PER_CATEGORY)
   - لو باقي خلايا زيادة، تاخذها مجالات بالتناوب بين الجولات (مرة ثالثة)
   - داخل كل مجال الأسئلة تدور بالترتيب: اللي طلع ما يتكرر لين تخلص أسئلة المجال، بعدها يرجع من الأول
   - مكان كل مجال في الشبكة عشوائي
   الدور محفوظ على الجهاز، فيكمل حتى لو انفتحت الصفحة من جديد */
const PER_CATEGORY = 2;
const ROTATION_KEY = "aiclub_wasel_rotation_v2"; // v2 = الدور على الأسئلة اللي انفتحت

function loadRotation() {
  try { return JSON.parse(localStorage.getItem(ROTATION_KEY)) || {}; } catch (e) { return {}; }
}
function saveRotation(rot) {
  try { localStorage.setItem(ROTATION_KEY, JSON.stringify(rot)); } catch (e) {}
}

/* الدور يمشي على الأسئلة اللي «انفتحت» بس (شافها لاعب)، مو اللي انحطت في الشبكة:
   rot.used[مجال] = أرقام الأسئلة اللي انفتحت في الدورة الحالية.
   لما تنفتح كل أسئلة المجال، تبدأ دورة جديدة. */
function categoryPools() {
  const pools = {};
  QUESTIONS.forEach((q, i) => (pools[q.c] = pools[q.c] || []).push(i));
  return pools;
}

function pickQuestions(n) {
  const rot = loadRotation();
  rot.used = rot.used || {};
  const pools = categoryPools();
  const cats = Object.keys(CATEGORIES).filter((c) => pools[c] && pools[c].length);

  // كل مجال مرتين، والخلايا الزايدة بالتناوب
  let slots = [];
  cats.forEach((c) => { for (let i = 0; i < PER_CATEGORY; i++) slots.push(c); });
  let extra = rot.extra || 0;
  while (slots.length < n) { slots.push(cats[extra % cats.length]); extra++; }
  rot.extra = extra % cats.length;
  slots = slots.slice(0, n);
  saveRotation(rot);

  // لكل مجال: اللي ما انفتح في الدورة أول (بالترتيب)، وبعدها اللي انفتح
  const taken = {};
  const out = slots.map((c) => {
    const pool = pools[c];
    const used = new Set(rot.used[c] || []);
    const order = pool.filter((i) => !used.has(i)).concat(pool.filter((i) => used.has(i)));
    taken[c] = taken[c] || new Set();
    const i = order.find((x) => !taken[c].has(x)) ?? order[0];
    taken[c].add(i);
    return QUESTIONS[i];
  });
  return shuffle(out);
}

// تنادى لما اللاعب يفتح سؤال: نسجّله إنه انفتح
function markQuestionSeen(q) {
  const i = QUESTIONS.indexOf(q);
  if (i < 0) return;
  const rot = loadRotation();
  rot.used = rot.used || {};
  const pool = categoryPools()[q.c] || [];
  const used = new Set(rot.used[q.c] || []);
  used.add(i);
  // انفتحت كل أسئلة المجال: دورة جديدة
  rot.used[q.c] = used.size >= pool.length ? [] : [...used];
  saveRotation(rot);
}

function chooseEnds() {
  // ثابتين دائمًا: ⭐ أول خلية فوق يسار، و🏁 آخر خلية تحت يمين. اللي يتغيّر بس الأسئلة
  const { ROWS, COLS } = CONFIG;
  return { start: [0, 0], finish: [ROWS - 1, COLS - 1] };
}

function buildBoard() {
  const svg = $("board");
  svg.innerHTML = "";
  state.cells.clear();

  const { ROWS, COLS } = CONFIG;
  const width = COLS * HEX_W + HEX_W / 2 + 16;
  const height = (ROWS - 1) * ROW_H + 2 * R + 16;
  svg.setAttribute("viewBox", `0 0 ${width.toFixed(1)} ${height.toFixed(1)}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  svg.innerHTML = `
    <defs>
      <linearGradient id="gOwned" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#6ddc78"/>
        <stop offset="1" stop-color="#2f9e44"/>
      </linearGradient>
      <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="6" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>`;

  const { start, finish } = chooseEnds();
  state.start = start;
  state.finish = finish;

  const questions = pickQuestions(ROWS * COLS - 2);
  let qi = 0;

  const layer = document.createElementNS(SVG_NS, "g");
  svg.appendChild(layer);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const isStart = r === start[0] && c === start[1];
      const isFinish = r === finish[0] && c === finish[1];
      const { x, y } = cellCenter(r, c);

      const g = document.createElementNS(SVG_NS, "g");
      g.classList.add("cell");
      const poly = document.createElementNS(SVG_NS, "polygon");
      poly.classList.add("hex");
      poly.setAttribute("points", hexPoints(x, y, R - 4));
      const { txt, img } = makeCellIcon(x, y);
      g.append(poly, txt, img);
      layer.appendChild(g);

      const cell = { r, c, g, txt, img, status: "free", question: null, icon: "", iconImg: null };
      if (isStart) {
        cell.status = "owned"; cell.icon = "⭐"; g.classList.add("start");
      } else if (isFinish) {
        cell.status = "finish"; cell.icon = "🏁"; g.classList.add("finish");
      } else {
        cell.question = questions[qi++];
        const cat = CATEGORIES[cell.question.c];
        cell.icon = cat.icons[rand(cat.icons.length)];
        cell.iconImg = cat.img || null;
      }
      setCellIcon(cell, cell.icon, cell.iconImg);
      g.addEventListener("click", () => onCellClick(cell));
      state.cells.set(key(r, c), cell);
    }
  }

  const path = document.createElementNS(SVG_NS, "path");
  path.classList.add("path-line");
  path.id = "pathLine";
  svg.appendChild(path);

  refreshBoard();
}

function cellAt(r, c) { return state.cells.get(key(r, c)); }

/* أيقونة الخلية: إيموجي (نص)، أو صورة لو المجال له img (مثل علم السعودية،
   لأن ويندوز يعرض إيموجي الأعلام كحرفين بدل العلم) */
function makeCellIcon(x, y) {
  const txt = document.createElementNS(SVG_NS, "text");
  txt.classList.add("emo");
  txt.setAttribute("x", x);
  txt.setAttribute("y", y + 2);
  txt.setAttribute("font-family", '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif');
  const img = document.createElementNS(SVG_NS, "image");
  img.classList.add("emo-img");
  const s = 54;
  img.setAttribute("x", x - s / 2);
  img.setAttribute("y", y - s / 2);
  img.setAttribute("width", s);
  img.setAttribute("height", s);
  img.style.display = "none";
  return { txt, img };
}

function setCellIcon(cell, text, src) {
  if (src) {
    cell.img.setAttribute("href", src);
    cell.img.style.display = "";
    cell.txt.textContent = "";
  } else {
    cell.img.style.display = "none";
    cell.txt.textContent = text;
  }
}

/* أي خلايا تنفتح؟
   ١) نحسب لكل خلية كم خطوة باقية لـ🏁 (بدون المقفولة).
   ٢) تنفتح الخلايا اللي جنب طريقك وما ترجّعك لورا: اللي قدّامك واللي جنبك على نفس
      المسافة من 🏁 (عشان يقدر يختار المجال اللي يعرفه).
   ٣) لازم يكون فيه خيارين على الأقل: لو أقل، نكمّل بالأقرب للنهاية،
      والأولوية للي جنب آخر خلية وصلتها (عشان ما تنفتح خلية بعيدة ورا).
   ترجع مجموعة مفاتيح الخلايا المتاحة. (نفس الدالة تستخدمها لوحة الشرح) */
const MIN_CHOICES = 2;
function pickAvailable(all, nb, statusOf, finish, last) {
  const D = new Map([[key(...finish), 0]]);
  const q = [finish];
  while (q.length) {
    const [r, c] = q.shift();
    const d = D.get(key(r, c));
    for (const [nr, nc] of nb(r, c)) {
      const k = key(nr, nc);
      if (D.has(k) || statusOf(nr, nc) === "locked") continue;
      D.set(k, d + 1);
      q.push([nr, nc]);
    }
  }
  let best = Infinity;
  const front = [];
  for (const [r, c] of all) {
    const st = statusOf(r, c);
    const d = D.get(key(r, c));
    if (st === "owned" && d !== undefined) best = Math.min(best, d);
    if (st !== "free" || d === undefined) continue;
    if (nb(r, c).some(([nr, nc]) => statusOf(nr, nc) === "owned")) front.push({ r, c, d });
  }
  const pick = front.filter((f) => f.d <= best);

  // اللفّة: لو انقفلت خلية جنب الخلية اللي واقف عليها، يقدر يلف حولها:
  // تنفتح جيرانه اللي أبعد بخطوة وحدة بس، بشرط ما ترجّعه يسار (لورا)
  if (last && nb(last[0], last[1]).some(([r, c]) => statusOf(r, c) === "locked")) {
    const dLast = D.get(key(last[0], last[1]));
    const lx = cellCenter(last[0], last[1]).x;
    for (const f of front) {
      if (pick.includes(f) || dLast === undefined || f.d > dLast + 1) continue;
      if (!nb(f.r, f.c).some(([r, c]) => r === last[0] && c === last[1])) continue;
      if (cellCenter(f.r, f.c).x < lx - 1) continue;
      pick.push(f);
    }
  }

  if (pick.length < MIN_CHOICES) {
    const nearLast = (f) => !!last && nb(f.r, f.c).some(([r, c]) => r === last[0] && c === last[1]);
    const rest = front
      .filter((f) => !pick.includes(f))
      .sort((a, b) => a.d - b.d || nearLast(b) - nearLast(a));
    while (pick.length < MIN_CHOICES && rest.length) pick.push(rest.shift());
  }
  return new Set(pick.map((f) => key(f.r, f.c)));
}

function refreshBoard() {
  let anyAvail = false;
  const all = [...state.cells.values()].map((c) => [c.r, c.c]);
  state.availSet = pickAvailable(all, neighbors, (r, c) => cellAt(r, c).status, state.finish, state.lastOwned || state.start);
  state.cells.forEach((cell) => {
    const g = cell.g;
    const avail = state.running && !state.busy && state.availSet.has(key(cell.r, cell.c));
    if (avail) anyAvail = true;
    g.classList.toggle("avail", avail);
    g.classList.toggle("owned", cell.status === "owned" && !g.classList.contains("start"));
    g.classList.toggle("locked", cell.status === "locked");
    g.classList.toggle("dim", cell.status === "free" && !avail);
    g.classList.toggle("selected", state.active === cell);
    if (cell.status === "locked") setCellIcon(cell, "🔒", null);
  });
  const owned = [...state.cells.values()].filter((c) => c.status === "owned").length - 1;
  $("cellsValue").textContent = owned;
  return anyAvail;
}

/* ---------------- السؤال ---------------- */
function onCellClick(cell) {
  if (!state.running || state.busy || state.active) return;
  if (!state.availSet || !state.availSet.has(key(cell.r, cell.c))) {
    if (cell.status === "free") toast("اختر وحدة من الخلايا المضيئة 👀");
    return;
  }
  Sound.play("Click");
  state.active = cell;
  refreshBoard();
  showQuestion(cell);
}

function showQuestion(cell) {
  const q = cell.question;
  markQuestionSeen(q); // انفتح، فيُحسب في دور المجال
  $("qEmpty").classList.add("hidden");
  $("qBody").classList.remove("hidden");
  if (cell.iconImg) {
    $("qEmoji").innerHTML = "";
    const im = document.createElement("img");
    im.src = cell.iconImg; im.alt = ""; im.className = "q-emoji-img";
    $("qEmoji").appendChild(im);
  } else {
    $("qEmoji").textContent = cell.icon;
  }
  $("qCat").textContent = CATEGORIES[q.c].label;
  $("qText").textContent = q.q;

  const box = $("qOptions");
  box.innerHTML = "";
  const order = shuffle(q.o.map((_, i) => i));
  order.forEach((i) => {
    const b = document.createElement("button");
    b.className = "q-opt";
    // خيار كله إيموجي (مثل الأسهم): نكبّره عشان يبان
    if (!/[\p{L}\p{N}]/u.test(q.o[i].replace(/️/g, ""))) b.classList.add("q-opt-emoji");
    b.textContent = q.o[i];
    b.dataset.idx = i;
    b.addEventListener("click", () => answer(cell, i, b));
    box.appendChild(b);
  });
  // لإعادة تشغيل الحركة
  $("qBody").style.animation = "none"; void $("qBody").offsetWidth; $("qBody").style.animation = "";
  revealQuestion();
}

// في الجوال السؤال يكون تحت الشبكة: لو الخيارات برا الشاشة ننزل لها تلقائيًا
function revealQuestion() {
  const card = $("questionCard");
  requestAnimationFrame(() => {
    const r = card.getBoundingClientRect();
    if (r.bottom > window.innerHeight - 8 || r.top < 0) {
      card.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  });
}

// بعد الجواب نرجع للشبكة عشان يختار الخلية الجاية
function revealBoard() {
  const side = document.querySelector(".side");
  if (side && side.scrollTop > 0) side.scrollTo({ top: 0, behavior: "smooth" });
  const top = $("board").getBoundingClientRect().top;
  if (top < 0 || window.scrollY > 0) window.scrollTo({ top: 0, behavior: "smooth" });
}

function clearQuestion() {
  $("qBody").classList.add("hidden");
  $("qEmpty").classList.remove("hidden");
  $("qOptions").innerHTML = "";
}

function answer(cell, idx, btn) {
  if (state.busy || !state.running || state.active !== cell) return;
  state.busy = true;
  const q = cell.question;
  const right = idx === q.a;

  // نلوّن اختيار اللاعب بس (أخضر أو أحمر). لو غلط ما نكشف الإجابة الصحيحة،
  // عشان اللي ينتظرون دورهم ما يحفظون الأجوبة
  [...$("qOptions").children].forEach((b) => {
    b.disabled = true;
    if (b === btn) b.classList.add(right ? "correct" : "wrong");
    else b.classList.add("dim");
  });

  if (right) {
    state.correct++;
    // نحفظ من وين جاء: أحدث خلية خضراء جنبها (عشان خط النهاية يمشي على رحلته الحقيقية)
    cell.parent = neighbors(cell.r, cell.c)
      .map(([r, c]) => cellAt(r, c))
      .filter((n) => n.status === "owned")
      .sort((a, b) => (b.order || 0) - (a.order || 0))[0] || null;
    cell.order = ++state.ownOrder;
    cell.status = "owned";
    state.lastOwned = [cell.r, cell.c];
    Sound.play("Correct");
    animate(cell.g, "pop");
  } else {
    state.wrong++;
    cell.status = "locked";
    Sound.play("Wrong");
    animate(cell.g, "hit");
  }
  state.active = null;
  refreshBoard();

  // هل وصل للنهاية؟
  if (right && neighbors(cell.r, cell.c).some(([r, c]) => r === state.finish[0] && c === state.finish[1])) {
    Platform.beginEnding(); // Prevent Escape/restart during the original 450ms arrival animation.
    // نوقف المؤقت لحظة الجواب الصحيح، والانتظار القصير بعده (حركة الوصول) ما ينحسب من وقته
    state.finishTime = elapsed();
    cancelAnimationFrame(state.rafId);
    setTimeout(() => endGame("win"), 450);
    return;
  }

  setTimeout(() => {
    if (!state.running) return;
    state.busy = false;
    clearQuestion();
    revealBoard();
    const anyAvail = refreshBoard();
    if (!anyAvail || !finishStillReachable()) endGame("blocked");
  }, CONFIG.FEEDBACK_MS);
}

function finishStillReachable() {
  // هل فيه طريق من أي خلية مملوكة للنهاية عبر خلايا غير مقفولة؟
  const owned = [...state.cells.values()].filter((c) => c.status === "owned");
  const passable = (r, c) => cellAt(r, c).status !== "locked";
  return owned.some((o) => bfsDistance([o.r, o.c], state.finish, passable) < Infinity);
}

function animate(el, cls) {
  el.classList.remove(cls); void el.getBoundingClientRect(); el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 450);
}

/* ---------------- المؤقت ---------------- */
function elapsed() { return (performance.now() - state.startTime) / 1000; }

function tick() {
  if (!state.running) return;
  const left = CONFIG.GAME_SECONDS - elapsed();
  $("timeValue").textContent = fmtClock(left);
  $("timeBar").style.width = `${Math.max(0, (left / CONFIG.GAME_SECONDS) * 100)}%`;
  $("statTime").classList.toggle("warn", left <= CONFIG.WARN_AT);

  const whole = Math.ceil(left);
  if (left <= 10 && whole !== state.lastTickSec && whole > 0) { state.lastTickSec = whole; Sound.play("Tick"); }

  if (left <= 0) { endGame("timeout"); return; }
  state.rafId = requestAnimationFrame(tick);
}

/* ---------------- مراحل اللعبة ---------------- */
function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === id));
  // كل شاشة تبدأ من فوق (في الجوال الصفحة تتمرر)
  window.scrollTo(0, 0);
  const side = document.querySelector(".side");
  if (side) side.scrollTop = 0;
}

function newGame(name) {
  if (!Platform.ready() || Platform.completed() || !$("screenStart").classList.contains("active")) return;
  const generation = Platform.generation();
  clearTimeout(state.resultTimer);
  Demo.stop(); // لوحة الشرح ترجع لوضعها الثابت
  Object.assign(state, {
    player: name, active: null, busy: false, running: false,
    correct: 0, wrong: 0, lastTickSec: null, finishTime: null, lastOwned: null, ownOrder: 0,
  });
  buildBoard();
  clearQuestion();
  $("timeValue").textContent = fmtClock(CONFIG.GAME_SECONDS);
  $("timeBar").style.width = "100%";
  $("statTime").classList.remove("warn");
  $("cellsValue").textContent = "0";
  showScreen("screenGame");
  countdown(() => {
    if (Platform.completed() || generation !== Platform.generation()) return;
    state.running = true;
    state.startTime = performance.now();
    refreshBoard();
    state.rafId = requestAnimationFrame(tick);
  });
}

function countdown(done) {
  const box = $("countdown");
  const num = $("countNum");
  let n = 3;
  box.classList.remove("hidden");
  const step = () => {
    num.textContent = n > 0 ? String(n) : "انطلق!";
    num.style.fontSize = n > 0 ? "" : "7rem";
    num.classList.toggle("go", n === 0);
    num.style.animation = "none"; void num.offsetWidth; num.style.animation = "";
    Sound.play(n > 0 ? "Count" : "Go");
    if (n === 0) { setTimeout(() => { box.classList.add("hidden"); done(); }, 550); return; }
    n--;
    setTimeout(step, 750);
  };
  step();
}

function endGame(reason) {
  if (!state.running) return;
  state.running = false;
  cancelAnimationFrame(state.rafId);
  const time = Math.min(state.finishTime != null ? state.finishTime : elapsed(), CONFIG.GAME_SECONDS);
  state.busy = true;
  refreshBoard();

  // كل اللاعبين يدخلون لوحة الأبطال بنقاطهم (حتى اللي ما وصل)
  const win = reason === "win";
  const score = computeScore(win, time, state.correct);
  const entry = {
    id: `${Date.now()}-${rand(1e6)}`, name: state.player, score, win,
    time: Math.round(time * 10) / 10, correct: state.correct, wrong: state.wrong,
    cells: state.correct, at: Date.now(),
  };
  const rank = Leaderboard.add(entry);
  state.lastEntryId = entry.id;
  state.lastScore = score;
  Integration.report(entry, time, reason); // نرسل المعرّف والنقاط للنظام المركزي

  if (win) {
    const fin = cellAt(...state.finish);
    fin.g.classList.add("reached");
    drawWinningPath();
    Sound.play("Win");
    confetti();
    setTimeout(() => showResult("win", time, rank), 1300);
  } else {
    Sound.play("Lose");
    setTimeout(() => showResult(reason, time, rank), 900);
  }
}

function drawWinningPath() {
  // رحلة اللاعب كاملة: كل خلية جاوبها صح تنربط بالخلية اللي جاء منها،
  // وآخر خلية تنربط بـ🏁. (لو تفرّع، يبان التفرّع بعد)
  const pt = (c) => { const p = cellCenter(c.r, c.c); return `${p.x.toFixed(1)} ${p.y.toFixed(1)}`; };
  const owned = [...state.cells.values()]
    .filter((c) => c.status === "owned" && c.parent)
    .sort((a, b) => a.order - b.order);
  let d = owned.map((c) => `M ${pt(c.parent)} L ${pt(c)}`).join(" ");
  const last = state.lastOwned && cellAt(...state.lastOwned);
  const fin = cellAt(...state.finish);
  if (last) d += ` M ${pt(last)} L ${pt(fin)}`;
  const line = $("pathLine");
  line.setAttribute("d", d);
  line.classList.add("show");
}

function showResult(reason, time, rank) {
  const card = $("resultCard");
  card.classList.toggle("win", reason === "win");
  card.classList.toggle("lose", reason !== "win");

  const texts = {
    win: { e: "🏆", t: `كفو يا ${state.player}!`, s: rank >= 0 ? `وصّلت طريقك وجيت في المركز ${rank + 1} 🎉` : `وصّلت طريقك في ${fmtTime(time)} 👏` },
    timeout: { e: "⏰", t: "خلص الوقت!", s: "قربت مرة… جرّب مرة ثانية وكن أسرع 💪" },
    blocked: { e: "🔒", t: "انسدّ الطريق!", s: "الخلايا المقفولة سكّرت عليك الطريق، المرة الجاية فكّر قبل تختار 😉" },
  };
  const t = texts[reason];
  $("resultEmoji").textContent = t.e;
  $("resultTitle").textContent = t.t;
  $("resultSub").textContent = t.s;
  $("rScore").textContent = String(state.lastScore || 0);
  $("rTime").textContent = reason === "win" ? fmtTime(time) : "—";
  $("rCorrect").textContent = state.correct;
  $("rWrong").textContent = state.wrong;

  Leaderboard.render($("lbResult"), state.lastEntryId);
  showScreen("screenResult");
  if (PLATFORM_COPY) return;
  $("btnAgain").focus();

  // رجوع تلقائي لشاشة البداية
  let left = CONFIG.RESULT_IDLE_SECONDS;
  const upd = () => {
    if (!$("screenResult").classList.contains("active")) return;
    $("autoBack").textContent = `ترجع الشاشة للبداية بعد ${left} ثانية`;
    if (left-- <= 0) { goHome(); return; }
    state.resultTimer = setTimeout(upd, 1000);
  };
  clearTimeout(state.resultTimer);
  upd();
}

function goHome() {
  if (Platform.completed()) return;
  Platform.interrupt();
  clearTimeout(state.resultTimer);
  Leaderboard.render($("lbStart"));
  $("playerName").value = "";
  showScreen("screenStart");
}

/* ---------------- تأثيرات ---------------- */
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 1400);
}

function confetti() {
  const colors = ["#7e36e3", "#c9bfff", "#4fc95f", "#ffffff", "#2f9e44"];
  for (let i = 0; i < 70; i++) {
    const p = document.createElement("div");
    p.className = "confetti";
    p.style.left = `${Math.random() * 100}vw`;
    p.style.background = colors[i % colors.length];
    p.style.animationDuration = `${1.6 + Math.random() * 1.6}s`;
    p.style.animationDelay = `${Math.random() * 0.4}s`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 3800);
  }
}

/* ---------------- لوحة الشرح في شاشة البداية ----------------
   شبكة صغيرة (٣ × ٥) ثابتة على وضع البداية. لما أحد يضغط «شوف كيف تلعب» تلعب جولة
   مرة وحدة: تختار خلية ← صح ← غلط ← تلف ← توصل، ومع كل خطوة يضيء سطر القانون اللي يشرحها. */
const Demo = {
  ROWS: 3,
  COLS: 5,
  // نفس اتجاه اللعبة: ⭐ فوق يسار و🏁 تحت يمين
  START: [0, 0],
  FINISH: [2, 4],
  // كل خطوة: [الخلية، الحالة، رقم القانون اللي يضيء]
  STEPS: [
    [null, null, 0],
    [[0, 1], "selected", 0],
    [[0, 1], "owned", 1],
    [[1, 1], "selected", 0],
    [[1, 1], "locked", 2],
    [[0, 2], "selected", 0],
    [[0, 2], "owned", 1],
    [[1, 2], "selected", 0],
    [[1, 2], "owned", 1],
    [[1, 3], "selected", 0],
    [[1, 3], "owned", 1],
    ["win", null, 3],
  ],
  PATH: [[0, 0], [0, 1], [0, 2], [1, 2], [1, 3], [2, 4]],
  cells: new Map(),
  timer: 0,
  step: 0,

  neighbors(r, c) {
    const d = r % 2 === 1
      ? [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]]
      : [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]];
    return d.map(([dr, dc]) => [r + dr, c + dc])
      .filter(([rr, cc]) => rr >= 0 && rr < this.ROWS && cc >= 0 && cc < this.COLS);
  },

  build() {
    const svg = $("demoBoard");
    if (!svg) return;
    const width = this.COLS * HEX_W + HEX_W / 2 + 16;
    const height = (this.ROWS - 1) * ROW_H + 2 * R + 16;
    svg.setAttribute("viewBox", `0 0 ${width.toFixed(1)} ${height.toFixed(1)}`);
    // أسماء خاصة بلوحة الشرح (dOwned / dGlow): لو تشاركت نفس أسماء الشبكة الحقيقية،
    // المتصفح ياخذ اللي في شاشة البداية المخفية وتطلع الخلايا الخضراء فاضية من جوه
    svg.innerHTML = `
      <defs>
        <linearGradient id="dOwned" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#6ddc78"/><stop offset="1" stop-color="#2f9e44"/>
        </linearGradient>
        <filter id="dGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>`;
    const cats = Object.values(CATEGORIES);
    this.cells.clear();
    for (let r = 0; r < this.ROWS; r++) {
      for (let c = 0; c < this.COLS; c++) {
        const { x, y } = cellCenter(r, c);
        const g = document.createElementNS(SVG_NS, "g");
        g.classList.add("cell");
        const poly = document.createElementNS(SVG_NS, "polygon");
        poly.classList.add("hex");
        poly.setAttribute("points", hexPoints(x, y, R - 4));
        const { txt, img } = makeCellIcon(x, y);
        g.append(poly, txt, img);
        svg.appendChild(g);
        const cat = cats[(r * 7 + c * 3) % cats.length];
        this.cells.set(key(r, c), { r, c, g, txt, img, icon: cat.icons[0], iconImg: cat.img || null });
      }
    }
    const line = document.createElementNS(SVG_NS, "polyline");
    line.classList.add("path-line");
    svg.appendChild(line);
    this.line = line;
  },

  reset() {
    this.status = new Map();
    this.cells.forEach((cell, k) => this.status.set(k, "free"));
    this.status.set(key(...this.START), "owned");
    this.status.set(key(...this.FINISH), "finish");
    this.line.classList.remove("show");
    this.cells.get(key(...this.FINISH)).g.classList.remove("reached");
  },

  paint(selected) {
    const all = [...this.cells.values()].map((c) => [c.r, c.c]);
    const open = pickAvailable(all, (r, c) => this.neighbors(r, c), (r, c) => this.status.get(key(r, c)), this.FINISH);
    this.cells.forEach((cell, k) => {
      const st = this.status.get(k);
      const isStart = k === key(...this.START);
      const avail = !selected && open.has(k);
      const g = cell.g;
      g.classList.toggle("start", isStart);
      g.classList.toggle("finish", st === "finish");
      g.classList.toggle("owned", st === "owned" && !isStart);
      g.classList.toggle("locked", st === "locked");
      g.classList.toggle("selected", selected === k);
      g.classList.toggle("avail", avail);
      g.classList.toggle("dim", st === "free" && !avail && selected !== k);
      const special = isStart ? "⭐" : st === "finish" ? "🏁" : st === "locked" ? "🔒" : null;
      setCellIcon(cell, special || cell.icon, special ? null : cell.iconImg);
    });
  },

  highlightRule(i) {
    const items = document.querySelectorAll("#rules li");
    items.forEach((li, n) => li.classList.toggle("on", n === i));
    $("rules").classList.toggle("demo-on", i != null);
  },

  tick() {
    const [cell, st, rule] = this.STEPS[this.step];
    let selected = null;
    if (this.step === 0) this.reset();
    if (cell === "win") {
      this.cells.get(key(...this.FINISH)).g.classList.add("reached");
      const pts = this.PATH
        .map(([r, c]) => { const p = cellCenter(r, c); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; });
      this.line.setAttribute("points", pts.join(" "));
      this.line.classList.add("show");
    } else if (cell) {
      const k = key(...cell);
      if (st === "selected") selected = k;
      else {
        this.status.set(k, st);
        animate(this.cells.get(k).g, st === "owned" ? "pop" : "hit");
      }
    }
    this.paint(selected);
    this.highlightRule(rule);
    if (this.step === this.STEPS.length - 1) {
      // خلصت الجولة: نوقف على 🏁 ونرجّع القوانين طبيعية بعد شوي
      this.timer = setTimeout(() => this.finish(), 2200);
      return;
    }
    this.step++;
    this.timer = setTimeout(() => this.tick(), st === "selected" ? 700 : 1100);
  },

  play() {
    if (this.playing) return;
    this.playing = true;
    const btn = $("demoPlay");
    btn.disabled = true;
    btn.textContent = "… تلعب";
    this.step = 0;
    clearTimeout(this.timer);
    this.tick();
  },

  finish() {
    this.playing = false;
    this.highlightRule(null);
    const btn = $("demoPlay");
    btn.disabled = false;
    btn.textContent = "↻ مرة ثانية";
  },

  stop() {
    clearTimeout(this.timer);
    if (!$("demoBoard")) return;
    this.playing = false;
    this.reset();
    this.paint(null);
    this.highlightRule(null);
    const btn = $("demoPlay");
    btn.disabled = false;
    btn.textContent = "▶ شوف كيف تلعب";
  },

  start() {
    if (!$("demoBoard")) return;
    this.build();
    this.stop(); // وضع البداية الثابت
    $("demoPlay").addEventListener("click", () => this.play());
  },
};

/* ---------------- التشغيل ---------------- */
function init() {
  if (Platform.completed()) return;
  Sound.init();
  $("ruleTime").textContent = String(CONFIG.GAME_SECONDS);
  Leaderboard.render($("lbStart"));
  Demo.start();
  $("playerName").required = false;
  $("playerName").hidden = true;
  $("startForm").querySelector('label[for="playerName"]').hidden = true;
  $("startForm").querySelector('button[type="submit"]').disabled = !Platform.ready();
  $("btnAgain").remove();
  $("autoBack").hidden = true;
  Integration.init(); // لو النظام مرّر اسم/معرّف في الرابط
  if (!PLATFORM_COPY) Shared.start();     // لوحة الأبطال المشتركة (بس لو config.js فيه رابط شيت)

  // The scripts-only sandbox disallows native form submission. Keep the original
  // start button and user gesture without submitting a form or enabling allow-forms.
  $("startForm").addEventListener("submit", e => e.preventDefault());
  $("startForm").addEventListener("click", (e) => {
    if (e.target !== $("startForm").querySelector('button[type="submit"]')) return;
    e.preventDefault();
    const input = $("playerName");
    const name = "لاعب المنصة";
    if (!name) {
      input.classList.remove("shake"); void input.offsetWidth; input.classList.add("shake");
      input.focus();
      return;
    }
    input.blur();
    Sound.unlock(); // نضمن الصوت جاهز قبل العد التنازلي
    newGame(name);
  });

  // The host owns navigation after completion.
  $("btnSound").addEventListener("click", () => Sound.toggle());

  // نافذة «كيف تنحسب النقاط»
  const infoModal = $("infoModal");
  const openInfo = () => { infoModal.classList.remove("hidden"); $("infoClose").focus(); };
  const closeInfo = () => infoModal.classList.add("hidden");
  document.querySelectorAll("[data-open-info]").forEach((b) => b.addEventListener("click", openInfo));
  $("infoClose").addEventListener("click", closeInfo);
  infoModal.addEventListener("click", (e) => { if (e.target === infoModal) closeInfo(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !infoModal.classList.contains("hidden")) closeInfo();
  });


  // زر ملء الشاشة يختفي في المتصفحات اللي ما تدعمه (مثل سفاري الآيفون)
  if (!document.fullscreenEnabled) $("btnFull").classList.add("hidden");
  $("btnFull").addEventListener("click", () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.();
  });

  // اختصارات المشرف على البوث
  document.addEventListener("keydown", (e) => {
    if (Platform.completed()) return;
    // Ctrl + Shift + L : مسح لوحة الأبطال
    if (e.ctrlKey && e.shiftKey && e.code === "KeyL") {
      e.preventDefault();
      if (Shared.on) { toast("اللوحة مشتركة: امسحي الصفوف من الشيت 📄"); return; }
      if (window.confirm("متأكد تبي تمسح لوحة الأبطال؟")) {
        Leaderboard.clear();
        Leaderboard.render($("lbStart"));
        Leaderboard.render($("lbResult"));
        toast("انمسحت لوحة الأبطال ✅");
      }
    }
    // Esc أثناء اللعب: إنهاء الجولة والرجوع للبداية
    if (e.key === "Escape" && $("screenGame").classList.contains("active") && $("countdown").classList.contains("hidden")) {
      state.running = false;
      cancelAnimationFrame(state.rafId);
      goHome();
    }
  });

}

document.addEventListener("DOMContentLoaded", init);
