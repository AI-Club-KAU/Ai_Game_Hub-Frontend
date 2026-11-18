/* ===== الإعدادات ===== */
// ai: الصورة التي صنعها الذكاء الاصطناعي في كل جولة ("left" يسار الصفحة في ملف PDF، أو "right" يمين)
// الإجابات مؤكدة.
const ROUNDS = [
  { id: 1, ai: "right" },
  { id: 2, ai: "left"  },
  { id: 3, ai: "right" },
  { id: 4, ai: "right" },
  { id: 5, ai: "left"  },
  { id: 6, ai: "left"  },
  { id: 7, ai: "right" },
  { id: 8, ai: "left"  },
];
const TIME_PER_ROUND = 15;   // ثواني
const MAX_SCORE = 100;       // أقصى نتيجة للعبة
const BASE_POINTS = 10;      // نقاط الإجابة الصحيحة
const SPEED_BONUS_MAX = 2.5; // أقصى مكافأة سرعة لكل جولة (8 جولات × 12.5 = 100)
const fmt = (n) => String(Math.round(n * 10) / 10);
const SHUFFLE = true;        // ترتيب الجولات وأماكن الصور عشوائي

/* Platform adapter only: no participant identity, credentials or Backend calls. */
const Platform = (() => {
  const embedded = window.parent !== window;
  let port = null, nonce = null, started = false, completed = false;
  const rounds = [];
  window.addEventListener("message", event => {
    const data = event.data;
    if (!embedded || port || started || event.source !== parent || event.origin !== location.origin ||
        !data || data.type !== "ai-hub:spot-the-ai-init" || data.version !== 1 || data.game !== "spot-the-ai" ||
        typeof data.nonce !== "string" || !data.nonce || data.nonce !== new URLSearchParams(location.search).get("nonce") ||
        event.ports.length !== 1) return;
    nonce = data.nonce; port = event.ports[0];
    port.onmessage = event => {
      const lock = event.data;
      if (lock?.type === "ai-hub:spot-the-ai-lock" && lock.version === 1 && lock.game === "spot-the-ai" && lock.nonce === nonce && completed) {
        $("againBtn").disabled = true;
      }
    };
    port.postMessage({ type: "ai-hub:spot-the-ai-ready", version: 1, game: "spot-the-ai", nonce });
  });
  return Object.freeze({
    begin() {
      if (!embedded) return true;
      if (!port || started || completed) return false;
      started = true; return true;
    },
    playing: () => !embedded || (started && !completed),
    advance: index => !embedded || (started && !completed && rounds.length === index + 1),
    record: (id, side, timeLeft) => { if (embedded && started && !completed) rounds.push({ id, side, timeLeft }); },
    finish(rawScore) {
      if (!embedded) return true;
      if (!port || !started || completed || rounds.length !== 8 || idx !== 8) return false;
      completed = true;
      $("againBtn").disabled = true;
      port.postMessage({ type: "spot-the-ai:result", version: 1, game: "spot-the-ai", nonce,
        score: Math.round(rawScore), maxScore: 100, rawScore, rounds });
      return true;
    },
  });
})();

/* ===== الحالة ===== */
const $ = (id) => document.getElementById(id);
let order, idx, score, streak, correct, timeLeft, timerId, locked, muted = false, flip;

const sounds = {
  click: new Audio("assets/sounds/click.wav"),
  correct: new Audio("assets/sounds/correct.wav"),
  wrong: new Audio("assets/sounds/wrong.wav"),
};
const play = (n) => { if (muted) return; try { sounds[n].currentTime = 0; sounds[n].play().catch(() => {}); } catch (e) {} };

function show(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $(id).classList.add("active");
  $("hud").hidden = id !== "game";
}

function startGame() {
  if (!Platform.begin()) return;
  order = ROUNDS.map((r) => ({ ...r }));
  if (SHUFFLE) order.sort(() => Math.random() - 0.5);
  idx = 0; score = 0; streak = 0; correct = 0;
  $("roundTotal").textContent = order.length;
  $("finalTotal").textContent = order.length;
  show("game");
  loadRound();
}

function loadRound() {
  if (!Platform.playing()) return;
  const r = order[idx];
  locked = false;
  flip = SHUFFLE && Math.random() < 0.5; // عرض الصورتين بترتيب معكوس أحياناً
  const [first, second] = flip ? ["right", "left"] : ["left", "right"];
  [["cardA", first], ["cardB", second]].forEach(([cid, side]) => {
    const c = $(cid);
    c.className = "card";
    c.disabled = false;
    c.dataset.side = side;
    c.querySelector("img").src = `assets/images/round${r.id}_${side}.jpg`;
    c.querySelector(".badge").textContent = "";
  });
  $("feedback").textContent = ""; $("feedback").className = "feedback";
  $("nextBtn").hidden = true;
  $("roundNo").textContent = idx + 1;
  $("score").textContent = fmt(score);
  $("streakBox").hidden = streak < 2; $("streak").textContent = streak;
  startTimer();
}

function startTimer() {
  if (!Platform.playing()) return;
  clearInterval(timerId);
  timeLeft = TIME_PER_ROUND;
  const bar = $("timerBar");
  bar.style.transition = "none"; bar.style.transform = "scaleX(1)";
  void bar.offsetWidth;
  bar.style.transition = `transform ${TIME_PER_ROUND}s linear`; bar.style.transform = "scaleX(0)";
  timerId = setInterval(() => { timeLeft--; if (timeLeft <= 0) answer(null); }, 1000);
}

function answer(side) {
  if (!Platform.playing()) return;
  if (locked) return;
  locked = true;
  clearInterval(timerId);
  const bar = $("timerBar");
  bar.style.transition = "none";
  const r = order[idx];
  const fb = $("feedback");
  const isRight = side === r.ai;
  Platform.record(r.id, side, timeLeft);

  document.querySelectorAll(".card").forEach((c) => {
    c.disabled = true;
    const ai = c.dataset.side === r.ai;
    c.classList.add(ai ? "is-ai" : "is-human");
    c.querySelector(".badge").textContent = ai ? "AI 🤖" : "إنسان 🎨";
    if (c.dataset.side === side && !ai) c.classList.add("picked-wrong");
  });

  if (isRight) {
    streak++; correct++;
    const pts = BASE_POINTS + (Math.max(timeLeft, 0) / TIME_PER_ROUND) * SPEED_BONUS_MAX;
    score += pts;
    fb.textContent = `أحسنت! +${fmt(pts)} نقطة`; fb.classList.add("ok"); play("correct");
  } else {
    streak = 0;
    fb.textContent = side === null ? "انتهى الوقت! الصورة المعلّمة هي الـ AI" : "إجابة خاطئة، الصورة المعلّمة هي الـ AI";
    fb.classList.add("no"); play("wrong");
  }
  $("score").textContent = fmt(score);
  $("streakBox").hidden = streak < 2; $("streak").textContent = streak;
  $("nextBtn").textContent = idx === order.length - 1 ? "عرض النتيجة" : "الجولة التالية";
  $("nextBtn").hidden = false;
  $("nextBtn").focus();
}

function next() {
  if (!Platform.advance(idx)) return;
  play("click");
  if (++idx >= order.length) return endGame();
  loadRound();
}

function endGame() {
  if (!Platform.finish(score)) return;
  show("end");
  $("finalScore").textContent = fmt(score);
  $("finalCorrect").textContent = correct;
  const ratio = correct / order.length;
  $("finalMsg").textContent = ratio === 1 ? "عين خبير! ما يفوتك شيء 👁️" : ratio >= 0.6 ? "ممتاز! عندك حس قوي لكشف الـ AI" : "حاول مرة ثانية وركّز على التفاصيل الصغيرة";
}

$("startBtn").onclick = () => { play("click"); startGame(); };
$("againBtn").onclick = () => { play("click"); startGame(); };
$("nextBtn").onclick = next;
$("cardA").onclick = () => answer($("cardA").dataset.side);
$("cardB").onclick = () => answer($("cardB").dataset.side);
$("muteBtn").onclick = () => { muted = !muted; $("muteBtn").textContent = muted ? "🔇" : "🔊"; };
