/* =========================================================================
   ESCAPE.EXE — Dev Week · Technical Department
   Vanilla JavaScript, no libraries, no network requests, no external assets.
   ========================================================================= */
(() => {
  "use strict";

  // Opt in only through the same-origin parent and a private MessageChannel.
  // A query parameter by itself never changes standalone replay behavior.
  let platformPort = null, platformNonce = null, platformComplete = false;
  function lockPlatformRound() {
    platformComplete = true;
    state.running = false;
    clearInput();
    document.body.inert = true;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (window.parent === window || event.source !== window.parent || event.origin !== location.origin ||
        platformPort || state.running || state.outcome !== null || !data || data.type !== "ai-hub:escape-init" || data.version !== 1 ||
        data.game !== "escape-exe" || typeof data.nonce !== "string" || !/^[a-f0-9-]{36}$/i.test(data.nonce) ||
        data.nonce !== new URLSearchParams(location.search).get("nonce") || event.ports.length !== 1) return;
    platformPort = event.ports[0]; platformNonce = data.nonce;
    platformPort.onmessage = (message) => {
      if (message.data?.type === "ai-hub:escape-lock" && message.data.nonce === platformNonce) lockPlatformRound();
    };
    platformPort.postMessage({ type: "ai-hub:escape-ready", nonce: platformNonce });
  });

  const $ = (id) => document.getElementById(id);
  const pad2 = (n) => String(n).padStart(2, "0");
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* -----------------------------------------------------------------------
     CONFIG
     ----------------------------------------------------------------------- */
  const COLS = 15, ROWS = 11, CELL = 50;
  const VIEW_W = COLS * CELL, VIEW_H = ROWS * CELL;
  const TOTAL_TIME = 180;           // seconds — the whole mission lasts at most 3 minutes
  const POINTS_PER_QUESTION = 10;   // 10 questions × 10 points = 100 max
  const STEP_MS = 115;              // movement speed while a key / pad button is held
  const FIRST_REPEAT_MS = 210;      // delay before hold-to-run kicks in
  const HIGHLIGHT_MS = 3200;        // red checkpoint highlight after a wrong answer
  const GLITCH_MS = 650;
  const FEEDBACK_MS = { correct: 1500, wrong: 2000 };

  /*
    The maze. # = wall, . = floor, S = start, E = exit, 0–9 = checkpoints in order.
    Each checkpoint blocks the only corridor forward, so they are always met in
    order 01 → 10, and the exit is only reachable after the last one.
  */
  const MAP = [
    "###############",
    "#S..0.#...7.#.#",
    "#####.###.#.#.#",
    "#.#...#.6.#...#",
    "#.#1###.#####8#",
    "#...#...5.#...#",
    "#.#######.#.###",
    "#.2.#..4..#9###",
    "###.#.#####.###",
    "#...3.#......E#",
    "###############"
  ];

  const WALL = [], CHECKPOINTS = [];
  let START = null, EXIT = null;
  MAP.forEach((row, y) => {
    WALL[y] = [];
    [...row].forEach((ch, x) => {
      WALL[y][x] = ch === "#";
      if (ch === "S") START = { x, y };
      else if (ch === "E") EXIT = { x, y };
      else if (ch >= "0" && ch <= "9") CHECKPOINTS[Number(ch)] = { x, y };
    });
  });

  /* Question bank: 25 reviewed Dev Week questions, five categories.
     A fresh set of 2 per category is selected at the start of each game. */
  const QUESTION_BANK = {
  "Programming": [
    {
      "system": "Repeat Command",
      "tag": "PROGRAMMING",
      "prompt": "The robot needs to repeat the same action. What should it use?",
      "options": [
        "Loop",
        "Variable",
        "Function",
        "Condition"
      ],
      "answer": 0,
      "explain": "Correct answer: Loop."
    },
    {
      "system": "Quick Calculation",
      "tag": "PROGRAMMING",
      "prompt": "What does `print(5 + 3)` display?",
      "options": [
        "53",
        "8",
        "15",
        "2"
      ],
      "answer": 1,
      "explain": "Correct answer: 8."
    },
    {
      "system": "Math Operator",
      "tag": "PROGRAMMING",
      "prompt": "Which symbol means multiplication in Python?",
      "options": [
        "+",
        "/",
        "*",
        "-"
      ],
      "answer": 2,
      "explain": "Correct answer: *."
    },
    {
      "system": "Store a Value",
      "tag": "PROGRAMMING",
      "prompt": "What can store a number in a program?",
      "options": [
        "Loop",
        "Variable",
        "Comment",
        "Print"
      ],
      "answer": 1,
      "explain": "Correct answer: Variable."
    },
    {
      "system": "Choose a Path",
      "tag": "PROGRAMMING",
      "prompt": "The robot must choose between two paths. Which statement helps it decide?",
      "options": [
        "Loop",
        "If",
        "Print",
        "Input"
      ],
      "answer": 1,
      "explain": "Correct answer: If."
    },
    {
      "system": "Energy Calculation",
      "tag": "PROGRAMMING",
      "prompt": "What does `print(10 - 4)` display?",
      "options": [
        "14",
        "6",
        "4",
        "10"
      ],
      "answer": 1,
      "explain": "Correct answer: 6."
    },
    {
      "system": "Voice Command",
      "tag": "PROGRAMMING",
      "prompt": "Which Python command displays Hello?",
      "options": [
        "show('Hello')",
        "say('Hello')",
        "print('Hello')",
        "echo('Hello')"
      ],
      "answer": 2,
      "explain": "Correct answer: print('Hello')."
    }
  ],
  "Debugging": [
    {
      "system": "Find the Bug",
      "tag": "DEBUGGING",
      "prompt": "What is a mistake in a program called?",
      "options": [
        "Bug",
        "Loop",
        "Variable",
        "Function"
      ],
      "answer": 0,
      "explain": "Correct answer: Bug."
    },
    {
      "system": "Fix the Bug",
      "tag": "DEBUGGING",
      "prompt": "What does debugging mean?",
      "options": [
        "Writing new code",
        "Finding and fixing errors",
        "Designing a page",
        "Saving a project"
      ],
      "answer": 1,
      "explain": "Correct answer: Finding and fixing errors."
    },
    {
      "system": "Button Repair",
      "tag": "DEBUGGING",
      "prompt": "A button doesn't respond when clicked. What should you check?",
      "options": [
        "Button code",
        "Button color",
        "Page title",
        "Font size"
      ],
      "answer": 0,
      "explain": "Correct answer: Button code."
    },
    {
      "system": "Test the Fix",
      "tag": "DEBUGGING",
      "prompt": "After fixing an error, what should a developer do?",
      "options": [
        "Test the program",
        "Delete the project",
        "Change its name",
        "Close the project"
      ],
      "answer": 0,
      "explain": "Correct answer: Test the program."
    },
    {
      "system": "Movement Repair",
      "tag": "DEBUGGING",
      "prompt": "The robot moves left instead of right. What may be wrong?",
      "options": [
        "Movement code",
        "Battery color",
        "Robot name",
        "Screen size"
      ],
      "answer": 0,
      "explain": "Correct answer: Movement code."
    }
  ],
  "Web Development": [
    {
      "system": "Website Style",
      "tag": "WEB DEVELOPMENT",
      "prompt": "Which language styles the appearance of websites?",
      "options": [
        "HTML",
        "Python",
        "CSS",
        "Java"
      ],
      "answer": 2,
      "explain": "Correct answer: CSS."
    },
    {
      "system": "Page Structure",
      "tag": "WEB DEVELOPMENT",
      "prompt": "Which language gives a webpage its structure?",
      "options": [
        "CSS",
        "HTML",
        "JavaScript",
        "Python"
      ],
      "answer": 1,
      "explain": "Correct answer: HTML."
    },
    {
      "system": "Interactive Page",
      "tag": "WEB DEVELOPMENT",
      "prompt": "Which language adds interactivity to webpages?",
      "options": [
        "JavaScript",
        "HTML",
        "SQL",
        "CSS"
      ],
      "answer": 0,
      "explain": "Correct answer: JavaScript."
    },
    {
      "system": "Style File",
      "tag": "WEB DEVELOPMENT",
      "prompt": "Which file commonly contains website styling?",
      "options": [
        "script.js",
        "style.css",
        "index.html",
        "README.md"
      ],
      "answer": 1,
      "explain": "Correct answer: style.css."
    },
    {
      "system": "Device Layout",
      "tag": "WEB DEVELOPMENT",
      "prompt": "A website works on both phones and laptops. What helps its layout adapt?",
      "options": [
        "Responsive design",
        "Dark mode",
        "More animations",
        "Longer code"
      ],
      "answer": 0,
      "explain": "Correct answer: Responsive design."
    }
  ],
  "Developer Tools": [
    {
      "system": "Code Editor",
      "tag": "DEVELOPER TOOLS",
      "prompt": "Which application is commonly used to write code?",
      "options": [
        "VS Code",
        "PowerPoint",
        "Photoshop",
        "Excel"
      ],
      "answer": 0,
      "explain": "Correct answer: VS Code."
    },
    {
      "system": "Share Code",
      "tag": "DEVELOPER TOOLS",
      "prompt": "What is GitHub commonly used for?",
      "options": [
        "Hosting and sharing code",
        "Designing logos",
        "Editing photos",
        "Creating animations"
      ],
      "answer": 0,
      "explain": "Correct answer: Hosting and sharing code."
    },
    {
      "system": "Launch Check",
      "tag": "DEVELOPER TOOLS",
      "prompt": "Before publishing a game, what should developers do?",
      "options": [
        "Test it",
        "Rename it",
        "Change its colors",
        "Add more questions"
      ],
      "answer": 0,
      "explain": "Correct answer: Test it."
    },
    {
      "system": "Device Testing",
      "tag": "DEVELOPER TOOLS",
      "prompt": "Why should a web game be tested on different devices?",
      "options": [
        "To check compatibility",
        "To change its title",
        "To increase points",
        "To add new levels"
      ],
      "answer": 0,
      "explain": "Correct answer: To check compatibility."
    }
  ],
  "AI in Development": [
    {
      "system": "AI Basics",
      "tag": "AI IN DEVELOPMENT",
      "prompt": "What does AI stand for?",
      "options": [
        "Artificial Intelligence",
        "Automatic Internet",
        "Advanced Input",
        "Active Information"
      ],
      "answer": 0,
      "explain": "Correct answer: Artificial Intelligence."
    },
    {
      "system": "AI Helper",
      "tag": "AI IN DEVELOPMENT",
      "prompt": "Which AI assistant can help write and explain code?",
      "options": [
        "Claude",
        "Excel",
        "Canva",
        "PowerPoint"
      ],
      "answer": 0,
      "explain": "Correct answer: Claude."
    },
    {
      "system": "Check AI Code",
      "tag": "AI IN DEVELOPMENT",
      "prompt": "AI generates code for a game. What should a developer do next?",
      "options": [
        "Test the code",
        "Trust it without checking",
        "Delete it",
        "Publish without review"
      ],
      "answer": 0,
      "explain": "Correct answer: Test the code."
    },
    {
      "system": "AI Mistakes",
      "tag": "AI IN DEVELOPMENT",
      "prompt": "Can AI-generated code contain mistakes?",
      "options": [
        "Yes",
        "No",
        "Only in Python",
        "Only on phones"
      ],
      "answer": 0,
      "explain": "Correct answer: Yes."
    }
  ]
};
  const CATEGORY_NAMES = Object.keys(QUESTION_BANK);
  let CHALLENGES = [];
  function buildChallenges() {
    const chosen = [];
    for (const category of CATEGORY_NAMES) {
      const pool = shuffle(QUESTION_BANK[category]);
      chosen.push(...pool.slice(0, 2).map((question) => ({ ...question, options: [...question.options] })));
    }
    return shuffle(chosen);
  }
  CHALLENGES = buildChallenges();
  const QUESTION_COUNT = CHALLENGES.length;           // 10
  const MAX_SCORE = QUESTION_COUNT * POINTS_PER_QUESTION; // 100

  const TIERS = {
    perfect: { title: "PERFECT RUN!",     mood: "star",  anim: "celebrate", confetti: 64 },
    high:    { title: "SYSTEMS ONLINE!",  mood: "happy", anim: "bounce",    confetti: 34 },
    mid:     { title: "HALF CHARGED!",    mood: "smile", anim: "float",     confetti: 0 },
    low:     { title: "REBOOT NEEDED",    mood: "sad",   anim: "sway",      confetti: 0 },
    zero:    { title: "SYSTEM CRASH!",    mood: "dizzy", anim: "wobble",    confetti: 0 }
  };

  /* -----------------------------------------------------------------------
     SOUND — everything is synthesised live with the Web Audio API.
     A gentle compressor + small room reverb keeps every effect soft and
     consistent. No audio files are loaded.
     ----------------------------------------------------------------------- */
  const Sound = (() => {
    let ctx = null, master = null, bus = null, verbReturn = null, noiseBuf = null, out = null;
    let enabled = true;
    const active = new Set();
    try { enabled = localStorage.getItem("robomaze-sound") !== "off"; } catch (e) { /* storage blocked */ }

    function makeImpulse(seconds, decay) {
      const rate = ctx.sampleRate, len = Math.floor(rate * seconds);
      const buf = ctx.createBuffer(2, len, rate);
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
      return buf;
    }

    function ensure() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try { ctx = new AC(); } catch (e) { return null; }
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -18; comp.knee.value = 10; comp.ratio.value = 3.5;
        comp.attack.value = 0.003; comp.release.value = 0.18;
        master = ctx.createGain(); master.gain.value = enabled ? 0.85 : 0;
        bus = ctx.createGain();
        const send = ctx.createGain(); send.gain.value = 0.16;
        const verb = ctx.createConvolver(); verb.buffer = makeImpulse(1.3, 3.4);
        const tone = ctx.createBiquadFilter(); tone.type = "lowpass"; tone.frequency.value = 5200;
        verbReturn = ctx.createGain(); verbReturn.gain.value = 1;
        bus.connect(comp);
        bus.connect(send); send.connect(verb); verb.connect(tone); tone.connect(verbReturn); verbReturn.connect(comp);
        comp.connect(master); master.connect(ctx.destination);
      }
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      return ctx;
    }

    function note(freq, t, { dur = 0.4, vol = 0.15, type = "sine", attack = 0.005, glide = null, cutoff = null } = {}) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur * 0.7);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let node = o;
      if (cutoff) {
        const f = ctx.createBiquadFilter();
        f.type = "lowpass"; f.frequency.value = cutoff; f.Q.value = 0.5;
        o.connect(f); node = f;
      }
      node.connect(g); g.connect(out);
      o.start(t); o.stop(t + dur + 0.05);
    }
    // Soft bell / glockenspiel: fundamental + quiet overtones.
    function bell(freq, t, dur = 0.6, vol = 0.13) {
      note(freq, t, { dur, vol });
      note(freq * 2, t, { dur: dur * 0.5, vol: vol * 0.3 });
      note(freq * 3.01, t, { dur: dur * 0.28, vol: vol * 0.1 });
      note(freq, t, { dur: dur * 0.2, vol: vol * 0.22, type: "triangle", cutoff: 3200 });
    }
    // Warm marimba-like pluck.
    function pluck(freq, t, dur = 0.32, vol = 0.12) {
      note(freq, t, { dur, vol, type: "triangle", cutoff: 2600 });
      note(freq * 2, t, { dur: dur * 0.45, vol: vol * 0.28 });
    }
    function whoosh(t, dur, { vol = 0.04, from = 400, to = 2600, q = 1.1 } = {}) {
      if (!noiseBuf) {
        const len = ctx.sampleRate;
        noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      const s = ctx.createBufferSource(); s.buffer = noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = q;
      f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.45);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(out);
      s.start(t); s.stop(t + dur + 0.02);
    }

    // Each effect gets its own gain group so it can be faded out instantly.
    function play(build, lengthSec = 1.5) {
      if (!enabled || !ensure()) return;
      try {
        const grp = ctx.createGain();
        grp.connect(bus);
        active.add(grp);
        out = grp;
        build(ctx.currentTime + 0.015);
        setTimeout(() => { active.delete(grp); try { grp.disconnect(); } catch (e) { /* already gone */ } }, (lengthSec + 0.5) * 1000);
      } catch (e) { /* never let audio break the game */ }
    }

    return {
      get enabled() { return enabled; },
      unlock: ensure,
      setEnabled(on) {
        enabled = on;
        try { localStorage.setItem("robomaze-sound", on ? "on" : "off"); } catch (e) { /* ignore */ }
        if (ctx && master) {
          master.gain.cancelScheduledValues(ctx.currentTime);
          master.gain.setTargetAtTime(on ? 0.85 : 0, ctx.currentTime, 0.03);
        }
      },
      /** Fade out every effect that is still ringing (used before "Game Over!"). */
      stopAll() {
        if (!ctx) return;
        const t = ctx.currentTime;
        active.forEach((g) => { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + 0.06); });
        verbReturn.gain.cancelScheduledValues(t);
        verbReturn.gain.setValueAtTime(verbReturn.gain.value, t);
        verbReturn.gain.linearRampToValueAtTime(0, t + 0.12);
      },
      restore() {
        if (!ctx) return;
        verbReturn.gain.cancelScheduledValues(ctx.currentTime);
        verbReturn.gain.setValueAtTime(1, ctx.currentTime);
      },
      /** Game start: airy sweep + quick rising arpeggio landing on a bright chime. */
      start() {
        play((t) => {
          whoosh(t, 0.42, { vol: 0.035, from: 320, to: 3200 });
          pluck(523.25, t + 0.02);
          pluck(659.25, t + 0.09);
          pluck(783.99, t + 0.16);
          bell(1046.5, t + 0.25, 0.95, 0.12);
          note(1567.98, t + 0.25, { dur: 0.7, vol: 0.03 });
          note(261.63, t + 0.25, { dur: 0.6, vol: 0.05, type: "triangle", cutoff: 900 });
        }, 1.4);
      },
      /** Correct answer: a soft two-note "ding-ding" with a little sparkle. */
      correct() {
        play((t) => {
          bell(1046.5, t, 0.5, 0.11);
          bell(1567.98, t + 0.085, 0.8, 0.12);
          note(3135.96, t + 0.17, { dur: 0.32, vol: 0.022 });
          note(2637.02, t + 0.21, { dur: 0.26, vol: 0.016 });
        }, 1.2);
      },
      open() { play((t) => { note(520, t, { dur: 0.14, vol: 0.055, glide: 880 }); note(1320, t + 0.05, { dur: 0.12, vol: 0.018 }); }, 0.4); },
      select() { play((t) => note(990, t, { dur: 0.05, vol: 0.022, cutoff: 3000 }), 0.2); },
      step(alt) { play((t) => note(alt ? 205 : 182, t, { dur: 0.05, vol: 0.028, glide: alt ? 150 : 135, cutoff: 900 }), 0.2); },
      tick() { play((t) => note(1180, t, { dur: 0.06, vol: 0.035, cutoff: 3000 }), 0.2); },
      warp() { play((t) => { note(880, t, { dur: 0.28, vol: 0.04, glide: 220, type: "triangle", cutoff: 1800 }); whoosh(t, 0.18, { vol: 0.016, from: 2000, to: 600, q: 0.8 }); }, 0.5); },
      blip() { play((t) => note(660, t, { dur: 0.1, vol: 0.045 }), 0.3); },
      /* Fallbacks, used only if the device has no working speech voice. */
      uhOh() { play((t) => { note(392, t, { dur: 0.2, vol: 0.09, type: "triangle", cutoff: 1400 }); note(311.13, t + 0.17, { dur: 0.36, vol: 0.09, type: "triangle", cutoff: 1200, glide: 290 }); }, 0.7); },
      gameOverSoft() { play((t) => { note(523.25, t, { dur: 0.3, vol: 0.06, type: "triangle", cutoff: 1500 }); note(440, t + 0.18, { dur: 0.3, vol: 0.06, type: "triangle", cutoff: 1500 }); note(349.23, t + 0.36, { dur: 0.6, vol: 0.06, type: "triangle", cutoff: 1300 }); }, 1.1); }
    };
  })();

  /* -----------------------------------------------------------------------
     VOICE — "Oops!" and "Game over!" are spoken with the device's own
     built-in speech voices (Web Speech API, works offline with local voices).
     The best-sounding English voice is chosen automatically; novelty and
     robotic voices are skipped. If speech is unavailable, a soft tone plays.
     ----------------------------------------------------------------------- */
  const Voice = (() => {
    const synth = window.speechSynthesis;
    const supported = !!(synth && typeof window.SpeechSynthesisUtterance === "function");
    const NOVELTY = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy|princess|eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley)\b/i;
    const PREMIUM = /natural|neural|premium|enhanced|siri|wavenet|studio/i;
    const FEMALE = /samantha|\bava\b|allison|susan|\bzoe\b|karen|serena|moira|tessa|nicky|joelle|noelle|\baria\b|jenny|libby|sonia|\bemma\b|michelle|google uk english female|\bzira\b|hazel|victoria|female/i;
    const MALE = /\bevan\b|\bnathan\b|\bguy\b|\bdavis\b|\bdaniel\b|\balex\b|\bthomas\b|\bgeorge\b|\bjames\b|\bdavid\b|male/i;
    const broken = new Set();
    let voice = null, primed = false;

    function rank(v) {
      const lang = (v.lang || "").toLowerCase().replace("_", "-");
      const name = v.name || "";
      if (!lang.startsWith("en") || NOVELTY.test(name) || broken.has(v.voiceURI || name)) return -1;
      if (!v.localService && navigator.onLine === false) return -1; // cloud voices need internet
      let s = 1;
      if (lang === "en-us") s += 3; else if (/^en-(gb|au|ca|ie|nz)/.test(lang)) s += 2;
      if (PREMIUM.test(name)) s += 6;
      if (FEMALE.test(name)) s += 15;
      if (MALE.test(name) && !FEMALE.test(name)) s -= 10;
      if (/google/i.test(name)) s += 1;
      if (/espeak|compact/i.test(name)) s -= 3;
      if (v.localService) s += 1;
      if (v.default) s += 0.5;
      return s;
    }
    function pick() {
      if (!supported) return null;
      let best = null, bestScore = -1;
      for (const v of synth.getVoices()) { const s = rank(v); if (s > bestScore) { bestScore = s; best = v; } }
      voice = best;
      return voice;
    }
    if (supported) {
      pick();
      if (synth.addEventListener) synth.addEventListener("voiceschanged", pick);
      else synth.onvoiceschanged = pick;
      window.addEventListener("online", pick);
      window.addEventListener("offline", pick);
    }

    function stop() { if (supported) { try { synth.cancel(); } catch (e) { /* ignore */ } } }

    /** iOS/Safari only allow speech after a tap — call this inside the START tap. */
    function prime() {
      if (!supported || primed) return;
      primed = true;
      try { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; u.rate = 2; synth.speak(u); } catch (e) { /* ignore */ }
    }

    function say(text, { pitch = 1, rate = 1, fallback = null } = {}) {
      if (!Sound.enabled) return;
      if (!supported) { if (fallback) fallback(); return; }
      let attempts = 0;
      const speakNow = () => {
        attempts++;
        const v = voice || pick();
        let u;
        try {
          u = new SpeechSynthesisUtterance(text);
          u.lang = "en-US";
          if (v) { u.voice = v; u.lang = v.lang; }
          u.pitch = pitch; u.rate = rate; u.volume = 1;
        } catch (e) {
          if (fallback) fallback();       // speech must never break the game
          return;
        }
        let started = false, settled = false;
        const watchdog = setTimeout(() => {
          if (!started && !settled) { settled = true; stop(); if (fallback) fallback(); }
        }, 1100);
        u.onstart = () => { started = true; clearTimeout(watchdog); };
        u.onend = () => { settled = true; clearTimeout(watchdog); };
        u.onerror = (e) => {
          clearTimeout(watchdog);
          if (started || settled) return;
          settled = true;
          const err = e && e.error;
          if (err === "interrupted" || err === "canceled") return;
          if (v && attempts < 2) { broken.add(v.voiceURI || v.name); voice = null; pick(); speakNow(); }
          else if (fallback) fallback();
        };
        try { synth.resume(); synth.speak(u); } catch (e) { clearTimeout(watchdog); if (fallback) fallback(); }
      };
      // Never stack phrases: cut whatever is speaking, then talk.
      if (synth.speaking || synth.pending) { stop(); setTimeout(speakNow, 70); } else speakNow();
    }

    return { say, stop, prime, get speaking() { return supported && (synth.speaking || synth.pending); } };
  })();

  /* -----------------------------------------------------------------------
     MASCOT — one <template>, cloned into every slot.
     ----------------------------------------------------------------------- */
  const robots = {};
  const moodTimers = {};
  function mountRobots() {
    const tpl = $("robotTemplate");
    document.querySelectorAll("[data-robot]").forEach((slot) => {
      const robot = tpl.content.firstElementChild.cloneNode(true);
      slot.appendChild(robot);
      robots[slot.dataset.robot] = robot;
    });
    fitRobots();
    if ("ResizeObserver" in window) {
      const ro = new ResizeObserver(() => fitRobots());
      document.querySelectorAll("[data-robot]").forEach((slot) => ro.observe(slot));
    }
    window.addEventListener("resize", fitRobots);
  }
  function fitRobots() {
    document.querySelectorAll("[data-robot]").forEach((slot) => {
      const robot = slot.firstElementChild;
      if (!robot) return;
      const k = parseFloat(slot.dataset.fit || "1");
      const s = Math.min(slot.clientHeight / 270, slot.clientWidth / 190) * k;
      if (s > 0) robot.style.setProperty("--s", s.toFixed(4));
    });
  }
  function setMood(name, mood, ms) {
    const r = robots[name];
    if (!r) return;
    clearTimeout(moodTimers[name]);
    r.dataset.mood = mood;
    if (ms) moodTimers[name] = setTimeout(() => { r.dataset.mood = restingMood(name); }, ms);
  }
  function restingMood(name) {
    if (name === "maze" || name === "card") return state.challengeOpen ? "think" : "idle";
    return "idle";
  }

  /* -----------------------------------------------------------------------
     STATE
     ----------------------------------------------------------------------- */
  const state = {
    player: { ...START }, next: 0, results: Array(QUESTION_COUNT).fill(null),
    score: 0, remaining: TOTAL_TIME, lastWhole: TOTAL_TIME,
    running: false, ending: false, warping: false,
    challengeOpen: false, locked: false, selected: null, order: [],
    feedbackTimer: 0, highlight: null, glitchUntil: 0, steps: 0, outcome: null
  };
  let currentScreen = "startScreen";
  let restartArmed = false;
  const playerEl = $("player");
  const playerBody = playerEl.querySelector(".player-body");
  const isTouch = window.matchMedia && window.matchMedia("(hover: none), (pointer: coarse)").matches;

  const isWall = (x, y) => x < 0 || y < 0 || x >= COLS || y >= ROWS || WALL[y][x];
  const checkpointAt = (x, y) => CHECKPOINTS.findIndex((c) => c.x === x && c.y === y);
  const isExit = (x, y) => x === EXIT.x && y === EXIT.y;
  const canControl = () => state.running && !state.challengeOpen && !state.warping && !state.ending;

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function formatTime(sec) { const s = Math.max(0, Math.ceil(sec)); return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`; }
  function shortTime(sec) { const s = Math.max(0, Math.floor(sec)); return `${Math.floor(s / 60)}:${pad2(s % 60)}`; }

  /* -----------------------------------------------------------------------
     SCREENS & UI HELPERS
     ----------------------------------------------------------------------- */
  function setScreen(id) {
    ["startScreen", "gameScreen", "resultScreen"].forEach((s) => {
      const el = $(s);
      const show = s === id;
      el.classList.toggle("hidden", !show);
      if (show) { el.classList.remove("screen-enter"); void el.offsetWidth; el.classList.add("screen-enter"); }
    });
    currentScreen = id;
    requestAnimationFrame(() => { fitRobots(); if (id === "gameScreen") setupCanvas(); });
  }

  let toastTimer = 0;
  function toast(msg, kind = "") {
    const t = $("toast");
    t.className = "toast hidden";
    void t.offsetWidth;
    t.textContent = msg;
    t.className = `toast ${kind}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add("hidden"), 2100);
  }

  function renderPips(el) {
    if (el.children.length !== QUESTION_COUNT) {
      el.innerHTML = "";
      for (let i = 0; i < QUESTION_COUNT; i++) el.appendChild(document.createElement("i"));
    }
    [...el.children].forEach((pip, i) => {
      const r = state.results[i];
      pip.className = r || (i === state.next && state.running ? "current" : "");
      pip.title = `${pad2(i + 1)} · ${CHALLENGES[i].system}`;
    });
  }

  function updateHud() {
    $("score").textContent = state.score;
    $("completed").textContent = state.next;
    renderPips($("hudPips"));
    const num = $("objectiveNum");
    if (state.next < QUESTION_COUNT) {
      const q = CHALLENGES[state.next];
      num.textContent = pad2(state.next + 1);
      num.classList.remove("done");
      $("objective").textContent = q.system;
      $("objectiveText").textContent = `Checkpoint ${pad2(state.next + 1)} · ${q.tag.split(" · ")[0].toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase())}`;
      $("mapStatus").textContent = `CHECKPOINT ${pad2(state.next + 1)} / ${QUESTION_COUNT}`;
    } else {
      num.textContent = "⇧";
      num.classList.add("done");
      $("objective").textContent = "Exit portal";
      $("objectiveText").textContent = "All systems checked. Escape now!";
      $("mapStatus").textContent = "EXIT OPEN";
    }
    updateTimer(true);
  }

  function updateTimer(force) {
    const whole = Math.ceil(state.remaining);
    if (!force && whole === state.lastWhole) return;
    const changed = whole !== state.lastWhole;
    state.lastWhole = whole;
    const text = formatTime(state.remaining);
    $("timer").textContent = text;
    $("challengeTimer").textContent = text;
    $("timerBar").style.width = `${(state.remaining / TOTAL_TIME) * 100}%`;
    $("timerCard").classList.toggle("warn", whole <= 30 && whole > 10);
    $("timerCard").classList.toggle("danger", whole <= 10);
    $("challengeTimer").classList.toggle("danger", whole <= 10);
    if (changed && !force && state.running && whole <= 5 && whole > 0) Sound.tick();
  }

  function bumpScore() {
    const el = $("score");
    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
  }

  /* -----------------------------------------------------------------------
     CANVAS — static maze layer + animated checkpoints / exit / effects
     ----------------------------------------------------------------------- */
  const canvas = $("mazeCanvas");
  const ctx = canvas.getContext("2d");
  const staticLayer = document.createElement("canvas");
  const sctx = staticLayer.getContext("2d");
  let dpr = 0;

  function setupCanvas() {
    const w = canvas.getBoundingClientRect().width;
    const ratio = window.devicePixelRatio || 1;
    const want = w > 0 ? clamp((w * ratio) / VIEW_W, 1, 2.5) : clamp(ratio, 1, 2);
    const r = Math.round(want * 4) / 4;
    if (r === dpr) return;
    dpr = r;
    canvas.width = staticLayer.width = Math.round(VIEW_W * dpr);
    canvas.height = staticLayer.height = Math.round(VIEW_H * dpr);
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawStatic(sctx);
  }

  function rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function drawStatic(c) {
    c.fillStyle = "#100b19";
    c.fillRect(0, 0, VIEW_W, VIEW_H);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const px = x * CELL, py = y * CELL;
        if (WALL[y][x]) {
          c.fillStyle = "#1b1227"; c.fillRect(px, py, CELL, CELL);
          c.strokeStyle = "#281a38"; c.lineWidth = 1; c.strokeRect(px + 0.5, py + 0.5, CELL - 1, CELL - 1);
          c.fillStyle = "#21152f"; c.fillRect(px + 5, py + 5, CELL - 10, 2);
        } else {
          c.fillStyle = (x + y) % 2 === 0 ? "#49345f" : "#3e2b53"; c.fillRect(px, py, CELL, CELL);
          c.strokeStyle = "#654b7d"; c.lineWidth = 1; c.strokeRect(px + 0.5, py + 0.5, CELL - 1, CELL - 1);
        }
      }
    }
    // Start pad
    const sx = START.x * CELL, sy = START.y * CELL;
    c.strokeStyle = "#b58cff66"; c.lineWidth = 1.5; c.setLineDash([4, 3]);
    rr(c, sx + 5, sy + 5, CELL - 10, CELL - 10, 8); c.stroke(); c.setLineDash([]);
    c.fillStyle = "#c3a1ff"; c.font = "800 8px system-ui, -apple-system, 'Segoe UI', sans-serif";
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText("START", sx + CELL / 2, sy + CELL - 9);
  }

  function drawCheck(c, cx, cy, s, color) {
    c.strokeStyle = color; c.lineWidth = 3.2; c.lineCap = "round"; c.lineJoin = "round";
    c.beginPath(); c.moveTo(cx - s * 0.5, cy + s * 0.02); c.lineTo(cx - s * 0.12, cy + s * 0.38); c.lineTo(cx + s * 0.55, cy - s * 0.38); c.stroke();
  }
  function drawCross(c, cx, cy, s, color) {
    c.strokeStyle = color; c.lineWidth = 3; c.lineCap = "round";
    c.beginPath(); c.moveTo(cx - s * 0.4, cy - s * 0.4); c.lineTo(cx + s * 0.4, cy + s * 0.4); c.moveTo(cx + s * 0.4, cy - s * 0.4); c.lineTo(cx - s * 0.4, cy + s * 0.4); c.stroke();
  }

  function drawCheckpoint(i, now) {
    const { x, y } = CHECKPOINTS[i];
    const px = x * CELL, py = y * CELL, cx = px + CELL / 2, cy = py + CELL / 2;
    const res = state.results[i];
    ctx.save();
    if (res === "correct") {
      ctx.fillStyle = "#123d36"; rr(ctx, px + 6, py + 6, CELL - 12, CELL - 12, 9); ctx.fill();
      ctx.strokeStyle = "#39ff88"; ctx.lineWidth = 2; ctx.shadowColor = "#39ff88"; ctx.shadowBlur = 8; ctx.stroke(); ctx.shadowBlur = 0;
      drawCheck(ctx, cx, cy, 14, "#39ff88");
    } else if (res === "wrong") {
      ctx.fillStyle = "#3b1927"; rr(ctx, px + 6, py + 6, CELL - 12, CELL - 12, 9); ctx.fill();
      ctx.strokeStyle = "rgba(255,77,109,.75)"; ctx.lineWidth = 2; ctx.stroke();
      drawCross(ctx, cx, cy, 13, "rgba(255,120,145,.9)");
    } else {
      const isNext = i === state.next && state.running;
      const p = isNext ? (Math.sin(now / 240) + 1) / 2 : 0;
      const inset = isNext ? 5 - p * 1.5 : 7;
      ctx.fillStyle = isNext ? "#30204a" : "#251834";
      rr(ctx, px + inset, py + inset, CELL - inset * 2, CELL - inset * 2, 9); ctx.fill();
      if (isNext) { ctx.shadowColor = "#c3a1ff"; ctx.shadowBlur = 10 + p * 14; }
      ctx.strokeStyle = isNext ? "#e2cfff" : "#7a5ea3"; ctx.lineWidth = isNext ? 2.5 : 2; ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = isNext ? "#ffffff" : "#b49ad8";
      ctx.font = "800 15px ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(pad2(i + 1), cx, cy + 1);
    }
    ctx.restore();
  }

  function drawExit(now) {
    const ex = EXIT.x * CELL, ey = EXIT.y * CELL, cx = ex + CELL / 2, cy = ey + CELL / 2;
    const open = state.next >= QUESTION_COUNT;
    ctx.save();
    if (open) {
      for (let k = 0; k < 2; k++) {
        const r = ((now / 1100) + k * 0.5) % 1;
        ctx.strokeStyle = `rgba(57,255,136,${(1 - r) * 0.7})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, 10 + r * 22, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = "#103a2d"; rr(ctx, ex + 4, ey + 4, CELL - 8, CELL - 8, 9); ctx.fill();
      ctx.strokeStyle = "#39ff88"; ctx.lineWidth = 2.5; ctx.shadowColor = "#39ff88"; ctx.shadowBlur = 14; ctx.stroke(); ctx.shadowBlur = 0;
      ctx.strokeStyle = "#39ff88"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
      const b = Math.sin(now / 200) * 2;
      ctx.beginPath(); ctx.moveTo(cx, cy + 3 + b); ctx.lineTo(cx, cy - 11 + b); ctx.moveTo(cx - 7, cy - 4 + b); ctx.lineTo(cx, cy - 11 + b); ctx.lineTo(cx + 7, cy - 4 + b); ctx.stroke();
      ctx.fillStyle = "#39ff88";
    } else {
      ctx.fillStyle = "#0f2420"; rr(ctx, ex + 5, ey + 5, CELL - 10, CELL - 10, 9); ctx.fill();
      ctx.setLineDash([4, 3]); ctx.strokeStyle = "rgba(57,255,136,.4)"; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
      // padlock
      ctx.strokeStyle = "rgba(57,255,136,.6)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy - 7, 5, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = "rgba(57,255,136,.6)"; rr(ctx, cx - 7, cy - 7, 14, 10, 2); ctx.fill();
      ctx.fillStyle = "rgba(57,255,136,.55)";
    }
    ctx.font = "800 7.5px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("EXIT", cx, ey + CELL - 12);
    ctx.restore();
  }

  function drawHighlight(now) {
    const h = state.highlight;
    if (!h) return;
    if (now >= h.until) { state.highlight = null; return; }
    const px = h.x * CELL, py = h.y * CELL, cx = px + CELL / 2, cy = py + CELL / 2;
    const fade = clamp((h.until - now) / 500, 0, 1);
    const pulse = (Math.sin(now / 140) + 1) / 2;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = `rgba(255,77,109,${0.2 + pulse * 0.18})`;
    rr(ctx, px + 2, py + 2, CELL - 4, CELL - 4, 9); ctx.fill();
    ctx.shadowColor = "#ff4d6d"; ctx.shadowBlur = 12 + pulse * 12;
    ctx.strokeStyle = "#ff4d6d"; ctx.lineWidth = 3; ctx.stroke();
    ctx.shadowBlur = 0;
    const age = now - h.start;
    if (age < 900) {
      const k = age / 900;
      ctx.strokeStyle = `rgba(255,77,109,${1 - k})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, 18 + k * 40, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  function drawGlitch(now) {
    if (now >= state.glitchUntil) return;
    const k = (state.glitchUntil - now) / GLITCH_MS;
    const W = canvas.width, H = canvas.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = 0; i < 6; i++) {
      const sh = (4 + Math.random() * 26) * dpr;
      const sy = Math.random() * (H - sh);
      const dx = (Math.random() - 0.5) * 30 * dpr * k;
      ctx.drawImage(canvas, 0, sy, W, sh, dx, sy, W, sh);
    }
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = `rgba(255,50,90,${0.1 * k})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function render(now) {
    if (!dpr) setupCanvas();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(staticLayer, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let i = 0; i < CHECKPOINTS.length; i++) drawCheckpoint(i, now);
    drawExit(now);
    drawHighlight(now);
    drawGlitch(now);
  }

  /* -----------------------------------------------------------------------
     PLAYER MOVEMENT
     ----------------------------------------------------------------------- */
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const OPPOSITE = { up: "down", down: "up", left: "right", right: "left" };
  const KEYMAP = { arrowup: "up", w: "up", arrowdown: "down", s: "down", arrowleft: "left", a: "left", arrowright: "right", d: "right" };
  const input = { held: [], nextAt: 0, glide: null };
  let leanTimer = 0, nudgeTimer = 0;

  function placePlayer() {
    playerEl.style.setProperty("--x", state.player.x);
    playerEl.style.setProperty("--y", state.player.y);
  }
  function lean(dx) {
    if (!dx) return;
    playerBody.style.rotate = `${dx * 7}deg`;
    clearTimeout(leanTimer);
    leanTimer = setTimeout(() => { playerBody.style.rotate = "0deg"; }, 190);
  }
  function nudge(dx, dy) {
    playerBody.style.translate = `${dx * 14}% ${dy * 14}%`;
    clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(() => { playerBody.style.translate = "0 0"; }, 90);
  }

  function stepPlayer(dir) {
    if (!canControl()) return false;
    const [dx, dy] = DIRS[dir];
    const nx = state.player.x + dx, ny = state.player.y + dy;
    lean(dx);
    if (isWall(nx, ny)) { nudge(dx, dy); return false; }
    const ci = checkpointAt(nx, ny);
    if (ci >= 0 && state.results[ci] === null) {
      nudge(dx, dy);
      if (ci === state.next) openChallenge(ci);
      else toast(`LOCKED · FIX SYSTEM ${pad2(state.next + 1)} FIRST`, "bad");
      return false;
    }
    if (isExit(nx, ny) && state.next < QUESTION_COUNT) {
      nudge(dx, dy);
      toast(`EXIT LOCKED · ${QUESTION_COUNT - state.next} SYSTEMS LEFT`);
      return false;
    }
    state.player = { x: nx, y: ny };
    placePlayer();
    state.steps++;
    Sound.step(state.steps % 2 === 0);
    if (isExit(nx, ny)) endGame("escaped");
    return true;
  }

  function pressDir(dir) {
    input.glide = null;
    input.held = input.held.filter((d) => d !== dir);
    input.held.push(dir);
    stepPlayer(dir);
    input.nextAt = performance.now() + FIRST_REPEAT_MS;
  }
  function releaseDir(dir) { input.held = input.held.filter((d) => d !== dir); }
  function clearInput() {
    input.held = [];
    input.glide = null;
    document.querySelectorAll(".touch-pad button.pressed").forEach((b) => b.classList.remove("pressed"));
  }

  // Swipe = run along the corridor until a junction, a checkpoint or a dead end.
  function openForGlide(x, y) {
    if (isWall(x, y)) return false;
    if (isExit(x, y)) return state.next >= QUESTION_COUNT;
    return true;
  }
  function glideNext(dir) {
    const { x, y } = state.player;
    const ways = Object.keys(DIRS).filter((d) => d !== OPPOSITE[dir] && openForGlide(x + DIRS[d][0], y + DIRS[d][1]));
    return ways.length === 1 ? ways[0] : null;
  }
  function startGlide(dir) {
    if (!canControl() || input.glide === dir) return;
    input.held = [];
    input.glide = stepPlayer(dir) ? dir : null;
    input.nextAt = performance.now() + STEP_MS;
  }

  function handleMovement(now) {
    if (!canControl() || now < input.nextAt) return;
    if (input.held.length) {
      stepPlayer(input.held[input.held.length - 1]);
      input.nextAt = now + STEP_MS;
    } else if (input.glide) {
      const d = glideNext(input.glide);
      input.glide = d && stepPlayer(d) ? d : null;
      input.nextAt = now + STEP_MS;
    }
  }

  /* -----------------------------------------------------------------------
     CHALLENGES
     ----------------------------------------------------------------------- */
  const KEYWORDS = /^(for|while|if|else|elif|in|int|double|boolean|String|return|def|class|public|static|void|new|True|False|None|null|true|false)$/;
  function highlightCode(code) {
    const re = /("[^"\n]*"|'[^'\n]*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)(?=\s*\()|([A-Za-z_]\w*)/g;
    let html = "", last = 0, m;
    while ((m = re.exec(code))) {
      html += escapeHtml(code.slice(last, m.index));
      if (m[1]) html += `<span class="tk-str">${escapeHtml(m[1])}</span>`;
      else if (m[2]) html += `<span class="tk-num">${m[2]}</span>`;
      else if (m[3]) html += KEYWORDS.test(m[3]) ? `<span class="tk-kw">${m[3]}</span>` : `<span class="tk-fn">${m[3]}</span>`;
      else html += KEYWORDS.test(m[4]) ? `<span class="tk-kw">${m[4]}</span>` : escapeHtml(m[4]);
      last = re.lastIndex;
    }
    return html + escapeHtml(code.slice(last));
  }

  function openChallenge(i) {
    clearInput();
    const q = CHALLENGES[i];
    state.challengeOpen = true;
    state.locked = false;
    state.selected = null;
    state.order = q.keepOrder ? q.options.map((_, k) => k) : shuffle(q.options.map((_, k) => k));

    const card = $("challengeCard");
    card.classList.remove("is-right", "is-wrong");
    $("challengeType").textContent = q.tag;
    $("challengeNumber").textContent = pad2(i + 1);
    $("challengeTitle").textContent = q.system;
    $("challengeQuestion").textContent = q.prompt;
    const code = $("codeBlock");
    if (q.code) { code.querySelector("code").innerHTML = highlightCode(q.code); code.classList.remove("hidden"); }
    else code.classList.add("hidden");

    const box = $("answerOptions");
    box.innerHTML = "";
    box.classList.toggle("single-col", q.options.some((o) => o.length > 24));
    state.order.forEach((orig, k) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "answer-option" + (q.mono ? " mono" : "");
      b.dataset.index = String(k);
      b.innerHTML = `<span class="key">${String.fromCharCode(65 + k)}</span><span class="opt-text"></span>`;
      b.querySelector(".opt-text").textContent = q.options[orig];
      b.addEventListener("click", () => selectOption(k));
      box.appendChild(b);
    });

    const fb = $("feedback");
    fb.className = "feedback";
    fb.textContent = isTouch ? "Tap an answer, then lock it in." : "Pick an answer (1–4), then press Enter.";
    const btn = $("submitAnswer");
    btn.disabled = true;
    btn.classList.remove("counting");
    btn.querySelector(".btn-text").textContent = "LOCK IN";

    $("challengeModal").classList.remove("hidden");
    card.scrollTop = 0;
    requestAnimationFrame(fitRobots);
    setMood("card", "think");
    setMood("maze", "think");
    updateTimer(true);
    Sound.open();
  }

  function selectOption(k) {
    if (!state.challengeOpen || state.locked) return;
    if (state.selected !== k) Sound.select();
    state.selected = k;
    document.querySelectorAll(".answer-option").forEach((el, j) => el.classList.toggle("selected", j === k));
    $("submitAnswer").disabled = false;
  }

  function submitAnswer() {
    if (!state.challengeOpen) return;
    if (state.locked) { closeChallenge(); return; } // button now reads CONTINUE
    if (state.selected === null) {
      const fb = $("feedback");
      fb.className = "feedback";
      void fb.offsetWidth;
      fb.className = "feedback nudge";
      fb.textContent = "Pick an answer first.";
      return;
    }
    state.locked = true;
    const i = state.next, q = CHALLENGES[i];
    const ok = state.order[state.selected] === q.answer;
    state.results[i] = ok ? "correct" : "wrong";   // every question counts exactly once
    state.next++;
    if (ok) state.score += POINTS_PER_QUESTION;

    document.querySelectorAll(".answer-option").forEach((b, k) => {
      b.disabled = true;
      if (state.order[k] === q.answer) b.classList.add("correct");
      else if (k === state.selected) b.classList.add("wrong");
    });
    const card = $("challengeCard");
    card.classList.add(ok ? "is-right" : "is-wrong");
    const fb = $("feedback");
    fb.className = `feedback ${ok ? "good" : "bad"}`;
    fb.innerHTML = ok
      ? `<b>SYSTEM RESTORED · +10</b><br>${escapeHtml(q.explain)}`
      : `<b>OOPS! · +0</b><br>${escapeHtml(q.explain)}`;

    if (ok) {
      Sound.correct();
      setMood("card", "happy");
      setMood("maze", "happy");
      bumpScore();
    } else {
      Voice.say("Oops!", { pitch: 1.2, rate: 1.02, fallback: () => Sound.uhOh() });
      setMood("card", "sad");
    }
    updateHud();

    const ms = ok ? FEEDBACK_MS.correct : FEEDBACK_MS.wrong;
    const btn = $("submitAnswer");
    btn.disabled = false;
    btn.querySelector(".btn-text").textContent = "CONTINUE ▸";
    btn.style.setProperty("--fill-ms", `${ms}ms`);
    btn.classList.remove("counting");
    void btn.offsetWidth;
    btn.classList.add("counting");
    clearTimeout(state.feedbackTimer);
    state.feedbackTimer = setTimeout(closeChallenge, ms);
  }

  function closeChallenge() {
    if (!state.challengeOpen) return;
    clearTimeout(state.feedbackTimer);
    state.challengeOpen = false;
    state.selected = null;
    $("challengeModal").classList.add("hidden");
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (!state.running) return;
    const i = state.next - 1;
    if (state.results[i] === "correct") {
      setMood("maze", "happy", 1400);
      toast(state.next >= QUESTION_COUNT ? "ALL SYSTEMS CHECKED · EXIT OPEN!" : `${CHALLENGES[i].system.toUpperCase()} RESTORED · +10`, "good");
    } else {
      sendBackToCheckpoint(i);
    }
    updateHud();
  }

  // Wrong answer → glitch, return to the PREVIOUS checkpoint, highlight it in red.
  function sendBackToCheckpoint(i) {
    const target = i === 0 ? START : CHECKPOINTS[i - 1];
    state.warping = true;
    clearInput();
    triggerGlitch();
    setMood("maze", "dizzy", 2300);
    const where = i === 0 ? "START" : `CHECKPOINT ${pad2(i)}`;
    toast(state.next >= QUESTION_COUNT ? `BACK TO ${where} · EXIT OPEN` : `OOPS! BACK TO ${where}`, "bad");
    if (!Voice.speaking) Sound.warp();
    playerEl.classList.remove("warp-in");
    playerEl.classList.add("warp-out");
    setTimeout(() => {
      state.player = { ...target };
      playerEl.classList.add("no-anim");
      placePlayer();
      void playerEl.offsetWidth;
      playerEl.classList.remove("warp-out", "no-anim");
      playerEl.classList.add("warp-in");
      const now = performance.now();
      state.highlight = { x: target.x, y: target.y, start: now, until: now + HIGHLIGHT_MS };
      setTimeout(() => { playerEl.classList.remove("warp-in"); state.warping = false; }, 450);
    }, 210);
  }

  function triggerGlitch() {
    const w = $("mazeWrap");
    w.classList.remove("glitching");
    void w.offsetWidth;
    w.classList.add("glitching");
    state.glitchUntil = performance.now() + GLITCH_MS;
    setTimeout(() => w.classList.remove("glitching"), GLITCH_MS + 60);
  }

  /* -----------------------------------------------------------------------
     GAME FLOW
     ----------------------------------------------------------------------- */
  function startGame() {
    if (platformPort && platformComplete) return;
    Sound.unlock();
    Sound.restore();
    Voice.stop();
    Voice.prime();
    CHALLENGES = buildChallenges(); // fresh balanced question selection for every run
    clearTimeout(state.feedbackTimer);
    Object.assign(state, {
      player: { ...START }, next: 0, results: Array(QUESTION_COUNT).fill(null),
      score: 0, remaining: TOTAL_TIME, lastWhole: TOTAL_TIME,
      running: true, ending: false, warping: false,
      challengeOpen: false, locked: false, selected: null, order: [],
      highlight: null, glitchUntil: 0, steps: 0, outcome: null
    });
    clearInput();
    restartArmed = false;
    playerEl.className = "player no-anim";
    playerBody.style.translate = "0 0";
    playerBody.style.rotate = "0deg";
    placePlayer();
    void playerEl.offsetWidth;
    playerEl.classList.remove("no-anim");
    ["challengeModal", "howToModal"].forEach((id) => $(id).classList.add("hidden"));
    setScreen("gameScreen");
    setMood("maze", "happy", 1000);
    updateHud();
    toast("FIX SYSTEM 01 · GO!", "good");
    Sound.start();
    lastFrame = performance.now();
  }


  function quitToMenu() {
    state.running = false;
    clearTimeout(state.feedbackTimer);
    clearInput();
    Voice.stop();
    Sound.stopAll();
    ["challengeModal"].forEach((id) => $(id).classList.add("hidden"));
    setMood("hero", "idle");
    setScreen("startScreen");
  }

  function endGame(reason) {
    if (!state.running) return;
    if (platformPort) platformComplete = true;
    state.running = false;
    state.ending = true;
    state.outcome = reason;
    clearInput();
    clearTimeout(state.feedbackTimer);
    state.challengeOpen = false;
    $("challengeModal").classList.add("hidden");
    Voice.stop();
    Sound.stopAll();            // nothing may play over "Game Over!"
    if (reason === "escaped") playerEl.classList.add("portal-in");
    else toast("TIME'S UP!", "bad");
    updateHud();
    setTimeout(() => {
      showResults();
      Voice.say("Game over!", { pitch: 1, rate: 0.95, fallback: () => Sound.gameOverSoft() });
    }, reason === "escaped" ? 650 : 750);
  }

  function showResults() {
    state.ending = false;
    const correct = state.results.filter((r) => r === "correct").length;
    const score = state.score;
    const tier = score >= MAX_SCORE ? "perfect" : score >= 70 ? "high" : score >= 40 ? "mid" : score >= 10 ? "low" : "zero";
    const T = TIERS[tier];
    const screen = $("resultScreen");
    screen.dataset.tier = tier;
    $("resultTitle").textContent = T.title;
    $("resultLine").textContent = `${correct}/${QUESTION_COUNT} systems fixed · ` +
      (state.outcome === "escaped" ? `escaped with ${shortTime(state.remaining)} left` : "time ran out");
    renderPips($("resultPips"));

    const slot = document.querySelector(".result-robot");
    slot.className = "robot-slot result-robot";
    void slot.offsetWidth;
    slot.classList.add(`anim-${T.anim}`);
    setMood("result", T.mood);

    setScreen("resultScreen");
    const scoreEl = $("finalScore");
    scoreEl.textContent = "0";
    setTimeout(() => countUp(scoreEl, score, 900), 350);
    $("confetti").innerHTML = "";
    if (T.confetti) setTimeout(() => burstConfetti(T.confetti), 300);

    const btn = $("restartButton");
    btn.classList.add("arming");
    restartArmed = false;
    setTimeout(() => { btn.classList.remove("arming"); if (platformPort && platformComplete) return; restartArmed = true; if (!isTouch) btn.focus({ preventScroll: true }); }, 1000);

    if (platformPort) lockPlatformRound();

    submitGameResult({
      game: "escape-exe",
      finalScore: score,
      maxScore: MAX_SCORE,
      correctAnswers: correct,
      questionsAnswered: state.next,
      escaped: state.outcome === "escaped",
      timeRemaining: Math.floor(state.remaining),
      durationSeconds: Math.round(TOTAL_TIME - state.remaining),
      answers: state.results.map((r, i) => ({ checkpoint: i + 1, system: CHALLENGES[i].system, result: r || "unanswered" }))
    });
  }

  function countUp(el, to, ms) {
    const t0 = performance.now();
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      el.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function burstConfetti(n) {
    const box = $("confetti");
    box.innerHTML = "";
    const colors = ["#c3a1ff", "#39ff88", "#a779e8", "#f4f9ff", "#ff9ba9"];
    for (let i = 0; i < n; i++) {
      const p = document.createElement("i");
      p.style.left = `${Math.random() * 100}%`;
      p.style.background = colors[i % colors.length];
      p.style.setProperty("--delay", `${(Math.random() * 0.7).toFixed(2)}s`);
      p.style.setProperty("--dur", `${(2.2 + Math.random() * 1.6).toFixed(2)}s`);
      p.style.setProperty("--drift", `${Math.round((Math.random() - 0.5) * 180)}px`);
      p.style.setProperty("--spin", `${Math.round((Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 540))}deg`);
      if (Math.random() > 0.6) { p.style.width = "8px"; p.style.height = "8px"; p.style.borderRadius = "50%"; }
      box.appendChild(p);
    }
    setTimeout(() => { box.innerHTML = ""; }, 4800);
  }

  /**
   * Platform integration point.
   * The central Dev Week platform can listen for the "robomaze:result" window
   * event, or for a postMessage when the game runs inside an <iframe>.
   * Do not add credentials or invent an endpoint here — replace the TODO once
   * the platform team shares its official API contract.
   */
  function submitGameResult(result) {
    console.info("[ESCAPE.EXE] Game result ready for platform integration:", result);
    try { window.dispatchEvent(new CustomEvent("robomaze:result", { detail: result })); } catch (e) { /* ignore */ }
    try { if (window.parent && window.parent !== window) window.parent.postMessage({ type: "robomaze:result", payload: result, ...(platformPort ? { nonce: platformNonce } : {}) }, "*"); } catch (e) { /* ignore */ }
    // TODO: Call the official Dev Week platform integration here when its API contract is provided.
  }

  /* -----------------------------------------------------------------------
     MAIN LOOP
     ----------------------------------------------------------------------- */
  let lastFrame = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - lastFrame) / 1000, 0.25);
    lastFrame = now;
    if (state.running) {
      state.remaining = Math.max(0, state.remaining - dt); // the clock also runs during challenges
      handleMovement(now);
      updateTimer(false);
      if (state.remaining <= 0) endGame("timeout");
    }
    if (currentScreen === "gameScreen") render(now);
  }

  /* -----------------------------------------------------------------------
     INPUT WIRING
     ----------------------------------------------------------------------- */
  function handleChallengeKey(e) {
    const k = e.key, kl = k.toLowerCase();
    if (["Enter", " ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(k)) e.preventDefault();
    if (e.repeat) return; // ignore auto-repeat from keys held while walking
    if (state.locked) { if (k === "Enter" || k === " ") closeChallenge(); return; }
    const n = state.order.length;
    let idx = -1;
    if (/^[1-9]$/.test(k)) idx = Number(k) - 1;
    else if (/^[a-d]$/.test(kl)) idx = kl.charCodeAt(0) - 97;
    if (idx >= 0 && idx < n) { selectOption(idx); return; }
    if (k.startsWith("Arrow")) {
      const cols = $("answerOptions").classList.contains("single-col") || window.innerWidth <= 640 ? 1 : 2;
      let s = state.selected === null ? -1 : state.selected;
      if (s < 0) s = 0;
      else if (k === "ArrowRight") s = Math.min(n - 1, s + 1);
      else if (k === "ArrowLeft") s = Math.max(0, s - 1);
      else if (k === "ArrowDown") s = Math.min(n - 1, s + cols);
      else if (k === "ArrowUp") s = Math.max(0, s - cols);
      selectOption(s);
      return;
    }
    if (k === "Enter") {
      const ae = document.activeElement;
      if (state.selected === null && ae && ae.classList && ae.classList.contains("answer-option")) { selectOption(Number(ae.dataset.index)); return; }
      submitAnswer();
    }
  }

  document.addEventListener("keydown", (e) => {
    const k = e.key, kl = (k || "").toLowerCase();
    const onButton = e.target && e.target.closest && e.target.closest("button");
    if (!$("howToModal").classList.contains("hidden")) {
      if (k === "Escape" || (k === "Enter" && !onButton)) { e.preventDefault(); closeHowTo(); }
      return;
    }
    if (currentScreen === "startScreen") {
      if ((k === "Enter" || k === " ") && !onButton && !e.repeat) { e.preventDefault(); startGame(); }
      return;
    }
    if (currentScreen === "resultScreen") {
      if (k === "Enter" && !onButton && !e.repeat && restartArmed) { e.preventDefault(); startGame(); }
      return;
    }
    if (state.challengeOpen) { handleChallengeKey(e); return; }
    const dir = KEYMAP[kl];
    if (dir) { e.preventDefault(); if (!e.repeat) pressDir(dir); }
  });
  document.addEventListener("keyup", (e) => { const dir = KEYMAP[(e.key || "").toLowerCase()]; if (dir) releaseDir(dir); });
  window.addEventListener("blur", clearInput);
  document.addEventListener("visibilitychange", () => { if (document.hidden) clearInput(); });

  // On-screen pad: press and hold to keep running.
  document.querySelectorAll(".touch-pad [data-dir]").forEach((btn) => {
    const dir = btn.dataset.dir;
    let pointer = null;
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      pointer = e.pointerId;
      btn.classList.add("pressed");
      try { btn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      Sound.unlock();
      pressDir(dir);
    });
    const release = (e) => { if (pointer !== null && e.pointerId !== pointer) return; pointer = null; btn.classList.remove("pressed"); releaseDir(dir); };
    ["pointerup", "pointercancel", "lostpointercapture"].forEach((ev) => btn.addEventListener(ev, release));
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
    btn.addEventListener("click", (e) => { if (e.detail === 0) { pressDir(dir); releaseDir(dir); } }); // keyboard activation
  });

  // Swipe on the maze (touch / pen).
  const mazeWrap = $("mazeWrap");
  let swipe = null;
  mazeWrap.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;
    swipe = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  mazeWrap.addEventListener("pointermove", (e) => {
    if (!swipe || e.pointerId !== swipe.id) return;
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    const threshold = Math.max(16, mazeWrap.clientWidth / 30);
    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
    swipe.x = e.clientX; swipe.y = e.clientY;
    startGlide(dir);
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach((ev) => mazeWrap.addEventListener(ev, (e) => { if (swipe && e.pointerId === swipe.id) swipe = null; }));

  // Buttons
  $("startButton").addEventListener("click", startGame);
  $("restartButton").addEventListener("click", () => { if (restartArmed) startGame(); });
  $("submitAnswer").addEventListener("click", submitAnswer);
  $("homeLink").addEventListener("click", (e) => {
    e.preventDefault();
    if (state.running) { return; }
    else if (currentScreen !== "startScreen") { Voice.stop(); setScreen("startScreen"); }
  });

  // Hero interaction: the robot responds to a hover or tap on the opening screen.
  const heroArt = document.querySelector("#startScreen .hero-art");
  if (heroArt) {
    let heroReactionTimer = null;
    heroArt.addEventListener("pointerenter", () => { if (currentScreen === "startScreen") setMood("hero", "happy"); });
    heroArt.addEventListener("pointerleave", () => { if (currentScreen === "startScreen") setMood("hero", "idle"); });
    heroArt.addEventListener("pointerdown", () => {
      if (currentScreen !== "startScreen") return;
      clearTimeout(heroReactionTimer);
      setMood("hero", "star");
      heroReactionTimer = setTimeout(() => {
        if (currentScreen === "startScreen") setMood("hero", "idle");
      }, 950);
    });
  }

  const startBtn = $("startButton");
  startBtn.addEventListener("pointerenter", () => setMood("hero", "happy"));
  startBtn.addEventListener("pointerleave", () => setMood("hero", "idle"));
  startBtn.addEventListener("focus", () => setMood("hero", "happy"));
  startBtn.addEventListener("blur", () => setMood("hero", "idle"));

  // How to play
  let howToReturn = null;
  function openHowTo() {
    howToReturn = document.activeElement;
    $("howToModal").classList.remove("hidden");
    $("howToModal").querySelector(".primary-button").focus({ preventScroll: true });
  }
  function closeHowTo() {
    $("howToModal").classList.add("hidden");
    if (howToReturn && howToReturn.focus) howToReturn.focus({ preventScroll: true });
  }
  $("howToButton").addEventListener("click", openHowTo);
  $("howToModal").querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", closeHowTo));

  // Sound toggle
  const soundBtn = $("soundToggle");
  function refreshSoundButton() {
    const on = Sound.enabled;
    soundBtn.classList.toggle("muted", !on);
    soundBtn.setAttribute("aria-label", on ? "Mute sound" : "Unmute sound");
    $("soundLabel").textContent = on ? "SOUND ON" : "SOUND OFF";
  }
  soundBtn.addEventListener("click", () => {
    Sound.unlock();
    Sound.setEnabled(!Sound.enabled);
    if (!Sound.enabled) { Voice.stop(); Sound.stopAll(); Sound.restore(); }
    else Sound.blip();
    refreshSoundButton();
  });

  window.addEventListener("resize", () => { if (currentScreen === "gameScreen") setupCanvas(); });

  /* -----------------------------------------------------------------------
     BOOT
     ----------------------------------------------------------------------- */
  mountRobots();
  refreshSoundButton();
  renderPips($("hudPips"));
  placePlayer();
  updateHud();
  requestAnimationFrame(frame);

  // Small read-only hook for the event platform (optional).
  window.RoboMaze = Object.freeze({
    start: startGame,
    getState: () => ({ running: state.running, score: state.score, answered: state.next, remaining: Math.ceil(state.remaining) })
  });
})();
