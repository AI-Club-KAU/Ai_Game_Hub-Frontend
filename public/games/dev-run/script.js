/* =========================================================================
   Dev Run: The Dev Week Challenge  —  script.js
   Vanilla JavaScript, no libraries, no network resources.

   Sections
     0. Helpers
     1. Editable quiz questions
     2. Game configuration (CONFIG)
     3. Obstacle & collectible registries (modular, easy to extend)
     4. Assets & sound
     5. Player controller
     6. Obstacle manager
     7. Collectible manager
     8. Collision detection
     9. Stage manager
    10. AI progress manager
    11. Quiz manager
    12. Score manager
    13. Game state manager
    14. UI (DOM)
    15. Input controller
    16. Renderer (canvas)
    17. Game (loop + orchestration)
    18. Bootstrap
   ========================================================================= */
(() => {
  'use strict';

  // Platform-only bridge. URL parameters alone never opt a standalone round in.
  let platformPort = null, platformNonce = null, platformComplete = false, platformEndState = null;
  function lockPlatformRound(game) {
    platformComplete = true;
    platformEndState ??= game.states.current;
    game.stopLoop();
    game.input.detach();
    document.body.inert = true;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }
  function bindPlatform(game) {
    window.addEventListener('message', event => {
      const data = event.data;
      if (window.parent === window || event.source !== window.parent || event.origin !== location.origin ||
          platformPort || !game.states.is(STATE.START) || !data || typeof data !== 'object' || Array.isArray(data) || data.type !== 'ai-hub:dev-run-init' ||
          data.version !== 1 || data.game !== 'dev-run' || typeof data.nonce !== 'string' ||
          !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(data.nonce) ||
          data.nonce !== new URLSearchParams(location.search).get('nonce') ||
          event.ports.length !== 1 || !(event.ports[0] instanceof MessagePort)) return;
      platformPort = event.ports[0]; platformNonce = data.nonce;
      platformPort.onmessage = message => {
        const value = message.data;
        if (value?.type === 'ai-hub:dev-run-lock' && value.version === 1 && value.game === 'dev-run' &&
            value.nonce === platformNonce) lockPlatformRound(game);
      };
      platformPort.postMessage({ type: 'ai-hub:dev-run-ready', version: 1, game: 'dev-run', nonce: platformNonce });
    });
  }

  /* ===================================================================
     0. HELPERS
     =================================================================== */
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function pickWeighted(weights) {
    let total = 0;
    for (const k in weights) total += weights[k];
    let r = Math.random() * total;
    for (const k in weights) {
      r -= weights[k];
      if (r <= 0) return k;
    }
    return Object.keys(weights)[0];
  }

  function formatTime(sec) {
    const s = Math.max(0, Math.ceil(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function hexToRgb(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  const rgba = (c, a) =>
    `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${a})`;

  // Rounded rectangle path (ctx.roundRect is not available on older iOS).
  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Show / hide an element. Uses BOTH the .is-hidden class and the hidden
  // attribute so it works whichever one the CSS relies on.
  function setHidden(el, hidden) {
    if (!el) return;
    el.classList.toggle('is-hidden', hidden);
    if (hidden) el.setAttribute('hidden', '');
    else el.removeAttribute('hidden');
  }

  const STATE = Object.freeze({
    START: 'START',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    STAGE_TRANSITION: 'STAGE_TRANSITION',
    QUIZ: 'QUIZ',
    GAME_OVER: 'GAME_OVER',
    VICTORY: 'VICTORY',
  });

  // States in which the world is moving and the game loop must run.
  const RUNNING_STATES = new Set([STATE.PLAYING, STATE.STAGE_TRANSITION]);

  /* ===================================================================
     1. EDITABLE QUIZ QUESTIONS  (10 questions: 4 + 4 + 2)
     - Question number N is shown at quiz gate N (see CONFIG.quiz.gates).
     - `stage` (0, 1, 2) must match the stage of the gate that shows it.
     - correctIndex is the index (0-based) of the right answer in `options`
       as written below. The options are shuffled every time a question is
       shown, and the answer is checked by its original index (never by its
       on-screen position), so shuffling can never mark a wrong answer correct.
     =================================================================== */
  const QUIZ_QUESTIONS = [
    /* ---- Stage 1: Data Collection (easy) ---- */
    {
      stage: 0,
      question: 'Adding more examples to a dataset always improves an AI model, even if the new examples are duplicates.',
      options: ['True', 'False'],
      correctIndex: 1,
    },
    {
      stage: 0,
      question: 'What does a label in a training dataset tell an AI model?',
      options: [
        'The category or name of an item',
        'How long the computer has been running',
        'The exact number of hours needed to complete training',
        'Which programming language the developer used',
      ],
      correctIndex: 0,
    },
    {
      stage: 0,
      question: 'Which dataset is best for training an AI to recognize cats?',
      options: [
        'A collection of animal pictures with no labels',
        'A collection of different animal names',
        'Thousands of copies of the same cat picture',
        'Thousands of cat pictures from different angles and backgrounds',
      ],
      correctIndex: 3,
    },
    {
      stage: 0,
      question: 'What happens if training data contains many mistakes?',
      options: [
        'The model may take longer to process each image',
        'The model may learn incorrect information',
        'The model may need fewer examples to learn',
        'The model may become better at recognizing new patterns',
      ],
      correctIndex: 1,
    },
    /* ---- Stage 2: Model Training (moderate) ---- */
    {
      stage: 1,
      question: 'An AI model performs well on training data but poorly on new data. What is the likely problem?',
      options: [
        'Underfitting',
        'Data imbalance',
        'Overfitting',
        'Data duplication',
      ],
      correctIndex: 2,
    },
    {
      stage: 1,
      question: 'A model that memorizes its training examples may struggle to recognize new examples of the same category.',
      options: ['True', 'False'],
      correctIndex: 0,
    },
    {
      stage: 1,
      question: 'What may happen if an AI model is trained with too little data?',
      options: [
        'It may take longer to complete training',
        'It may produce more detailed predictions',
        'It may become more accurate on all new examples',
        'It may struggle to make accurate predictions on new examples',
      ],
      correctIndex: 3,
    },
    {
      stage: 1,
      question: 'Why should developers use different examples when training an AI model?',
      options: [
        'To reduce the time needed for testing',
        'To help it recognize different situations',
        'To make all predictions produce the same result',
        'To reduce the need for a large training dataset',
      ],
      correctIndex: 1,
    },
    /* ---- Stage 3: Model Deployment (challenging) ---- */
    {
      stage: 2,
      question: 'Once an AI model passes testing, its performance in real-world conditions is guaranteed to remain the same.',
      options: ['True', 'False'],
      correctIndex: 1,
    },
    {
      stage: 2,
      question: 'An AI model achieves 98% accuracy during testing. After deployment, its accuracy drops significantly, even though the developers have not changed the model itself. Which explanation is the most accurate?',
      options: [
        'The model is overfitting because its testing accuracy was too high.',
        'The model needs more training epochs because deployment resets its learned parameters.',
        'The model is underfitting because it performed well on unseen testing data.',
        'The model may be experiencing data drift because real-world input data has changed.',
      ],
      correctIndex: 3,
    },
  ];

  /* ===================================================================
     2. GAME CONFIGURATION  (everything tweakable lives here)
     =================================================================== */
  const CONFIG = {
    canvas: { width: 540, height: 960 },     // internal resolution (CSS scales it)

    // Pseudo-3D road projection
    view: {
      horizonY: 250,
      groundY: 800,          // screen Y of the player's feet
      laneWidth: 150,        // pixels between lane centres at the player's depth
      perspective: 600,
      spawnDistance: 1400,   // z where objects appear
      despawnDistance: -220, // z where objects are removed
    },

    totalDuration: 120,      // seconds of gameplay
    stageDuration: 40,       // seconds per stage
    lives: 3,
    invulnerabilitySeconds: 1.6,   // after a hit
    postQuizGraceSeconds: 2.0,     // after a quiz
    stageTransitionSeconds: 1.6,   // banner time between stages (no spawning)
    fontFamily: 'Tajawal, "Segoe UI", Arial, sans-serif',

    // If true, "AI MODEL SUCCESSFULLY DEPLOYED!" also requires reaching the finish line.
    requireFinishForSuccess: true,

    stages: [
      { key: 'data', name: 'المرحلة 1: جمع البيانات', tagline: 'اجمع حزم البيانات!', accent: '#00e5ff', collectible: 'dataPacket' },
      { key: 'training', name: 'المرحلة 2: تدريب النموذج', tagline: 'اجمع أنوية التدريب!', accent: '#c77dff', collectible: 'trainingCore' },
      { key: 'deployment', name: 'المرحلة 3: إطلاق النموذج', tagline: 'اجمع مفاتيح الإطلاق!', accent: '#69f0ae', collectible: 'deploymentKey' },
    ],

    speed: {
      perStage: [380, 500, 620],  // base speed (world units / second) per stage
      inStageRamp: 40,            // extra speed gained gradually inside a stage
      urgencyBoost: 40,           // extra speed in the last 20 s
      max: 840,                   // hard cap (stage speed + question boosts)
      acceleration: 140,          // smooth acceleration between stages
      questionBoost: 12,          // extra speed gained after EVERY answered question
    },

    player: {
      lanes: [-1, 0, 1],
      laneSharpness: 18,   // higher = faster lane change
      jumpDuration: 0.72,
      jumpHeight: 175,
      slideDuration: 0.65,
      standHeight: 110,
      slideHeight: 50,
      width: 64,
      depth: 50,
      inputBufferSeconds: 0.18,
    },

    obstacles: {
      firstSpawnDelay: 2.2,
      densityEndScale: 0.8,        // spawn intervals shrink to 80 % by the end
      minRowInterval: 0.9,         // never closer than this (seconds)
      collectibleClearance: 380,   // z distance kept free around collectibles
      hitTolerance: 10,            // px forgiveness on the lane axis
      // Per stage: spawn interval range (s), chance of 2 obstacles in a row,
      // chance that a barrier spans two lanes, and obstacle type weights.
      stages: [
        { interval: [1.5, 2.3], doubleRowChance: 0.0, wideBarrierChance: 0.0, weights: { bug: 5, corrupted: 2 } },
        { interval: [1.2, 1.8], doubleRowChance: 0.25, wideBarrierChance: 0.2, weights: { bug: 3, virus: 3, corrupted: 3, barrierLow: 2 } },
        { interval: [0.95, 1.4], doubleRowChance: 0.45, wideBarrierChance: 0.3, weights: { bug: 2, virus: 3, corrupted: 3, barrierLow: 3, barrierHigh: 4 } },
      ],
    },

    collectibles: {
      perStage: 10,          // 10 per stage = 30 total
      firstSpawnAt: 2,       // seconds into the stage
      lastSpawnAt: 35,
      hoverHeight: 36,
      width: 56,
      depth: 40,
      hitTolerance: 6,
    },

    quiz: {
      shuffleOptions: true,
      // 10 gates = 10 questions (4 + 4 + 2). `time` = seconds of gameplay.
      // advanceStage: the stage ends right after this question (banner + new stage).
      // finalSprint:  last question before the finish line (banner, no new stage).
      // Gates with neither flag simply resume the run after the answer.
      gates: [
        // Stage 1 - Data Collection (4 questions)
        { time: 10, stage: 0 },
        { time: 20, stage: 0 },
        { time: 30, stage: 0 },
        { time: 40, stage: 0, advanceStage: true },
        // Stage 2 - Model Training (4 questions)
        { time: 50, stage: 1 },
        { time: 60, stage: 1 },
        { time: 70, stage: 1 },
        { time: 80, stage: 1, advanceStage: true },
        // Stage 3 - Model Deployment (2 questions)
        { time: 100, stage: 2 },
        { time: 116, stage: 2, finalSprint: true },
      ],
    },

    scoring: {
      collectibles: 30,      // max points for collecting all 30 items
      quizPerCorrect: 5,
      noCollision: 10,
      finish: 10,
      max: 0,                // filled in below = sum of all categories (see CONFIG.scoring.max)
    },

    swipeThreshold: 28,      // px

    /* Optional local assets. Put a path string (e.g. 'assets/images/bug.png')
       ONLY for files that really exist. null = use the built-in drawing.
       This avoids 404 errors in the console. */
    assets: {
      images: {
        robot: null,
        bug: null,
        virus: null,
        corrupted: null,
        barrierLow: null,
        barrierHigh: null,
        dataPacket: null,
        trainingCore: null,
        deploymentKey: null,
      },
      sounds: {
        collect: null,   // e.g. 'assets/sounds/collect.mp3'
        hit: null,
        jump: null,
        slide: null,
        correct: null,
        wrong: null,
        stage: null,
        victory: null,
        gameover: null,
      },
      soundVolume: 0.6,
      synthFallback: true, // tiny generated beeps when no sound file is set
    },
  };

  CONFIG.stages.forEach((s) => { s.rgb = hexToRgb(s.accent); });
  // Total possible score = collectibles + (10 questions x 10) + no-collision + finish.
  CONFIG.scoring.max = CONFIG.scoring.collectibles +
    CONFIG.scoring.quizPerCorrect * CONFIG.quiz.gates.length +
    CONFIG.scoring.noCollision + CONFIG.scoring.finish;
  const LANES = CONFIG.player.lanes;
  const TOTAL_COLLECTIBLES = CONFIG.collectibles.perStage * CONFIG.stages.length;

  /* ===================================================================
     3. OBSTACLE & COLLECTIBLE REGISTRIES
     To add a new obstacle: add an entry here + add it to a stage's
     `weights` in CONFIG.obstacles.stages.
     Vertical hitbox = [bottom, top] above the ground, in pixels.
     Rules of play:
       bug         -> jump over it (top 50)
       virus       -> change lane, or jump near the apex (top 100)
       corrupted   -> must change lane (too tall to jump)
       barrierLow  -> system-error beam, jump over it (top 45)
       barrierHigh -> laser barrier overhead, slide under it (bottom 75)
     =================================================================== */
  const OBSTACLE_TYPES = {
    bug: { label: 'Bug', width: 90, bottom: 0, top: 50, depth: 40, multiLane: false, imageKey: 'bug', draw: drawBug },
    virus: { label: 'Virus', width: 96, bottom: 0, top: 100, depth: 44, multiLane: false, imageKey: 'virus', draw: drawVirus },
    corrupted: { label: 'Corrupted Data', width: 96, bottom: 0, top: 200, depth: 50, multiLane: false, imageKey: 'corrupted', draw: drawCorrupted },
    barrierLow: { label: 'System Error', width: 110, bottom: 0, top: 45, depth: 36, multiLane: true, imageKey: 'barrierLow', draw: drawBarrierLow },
    barrierHigh: { label: 'Laser Barrier', width: 110, bottom: 75, top: 190, depth: 36, multiLane: true, imageKey: 'barrierHigh', draw: drawBarrierHigh },
  };

  const COLLECTIBLE_TYPES = {
    dataPacket: { label: 'DATA', color: '#00e5ff', imageKey: 'dataPacket', draw: drawDataPacket },
    trainingCore: { label: 'TRAINING', color: '#ffab40', imageKey: 'trainingCore', draw: drawTrainingCore },
    deploymentKey: { label: 'DEPLOY', color: '#ffd740', imageKey: 'deploymentKey', draw: drawDeploymentKey },
  };

  /* --- Obstacle drawing (local coords: origin = ground centre, y up = negative) --- */
  function drawBug(ctx, o, t) {
    const w = o.width;
    ctx.save();
    ctx.strokeStyle = '#1b8f5a';
    ctx.lineWidth = 3;
    for (let i = -1; i <= 1; i++) {
      const wig = Math.sin(t * 14 + i) * 3;
      ctx.beginPath();
      ctx.moveTo(i * 18, -10); ctx.lineTo(i * 18 - 14 + wig, 0);
      ctx.moveTo(i * 18, -10); ctx.lineTo(i * 18 + 14 - wig, 0);
      ctx.stroke();
    }
    ctx.fillStyle = '#39d98a';
    ctx.beginPath(); ctx.ellipse(0, -22, w * 0.42, 20, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#16794b';                       // spots
    ctx.beginPath(); ctx.arc(-14, -28, 5, 0, Math.PI * 2); ctx.arc(8, -30, 6, 0, Math.PI * 2); ctx.arc(-2, -16, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2bb673';                       // head
    ctx.beginPath(); ctx.arc(w * 0.34, -24, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff1744';                       // eye
    ctx.beginPath(); ctx.arc(w * 0.38, -27, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#1b8f5a'; ctx.lineWidth = 2;  // antennae
    ctx.beginPath(); ctx.moveTo(w * 0.34, -36); ctx.lineTo(w * 0.28, -49); ctx.moveTo(w * 0.4, -36); ctx.lineTo(w * 0.46, -49); ctx.stroke();
    ctx.restore();
  }

  function drawVirus(ctx, o, t) {
    ctx.save();
    ctx.shadowColor = '#ff00ff';
    ctx.shadowBlur = 12;
    ctx.strokeStyle = '#ff4081';
    ctx.lineWidth = 4;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + t * 0.8;
      const cx = Math.cos(a), cy = Math.sin(a);
      ctx.beginPath(); ctx.moveTo(cx * 34, -48 + cy * 34); ctx.lineTo(cx * 46, -48 + cy * 46); ctx.stroke();
      ctx.fillStyle = '#ff80ab';
      ctx.beginPath(); ctx.arc(cx * 47, -48 + cy * 47, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#b01fd6';
    ctx.beginPath(); ctx.arc(0, -48, 34, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';                          // angry eyes
    ctx.beginPath(); ctx.ellipse(-12, -54, 8, 10, 0, 0, Math.PI * 2); ctx.ellipse(12, -54, 8, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#200030';
    ctx.beginPath(); ctx.arc(-11, -52, 4, 0, Math.PI * 2); ctx.arc(11, -52, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#200030'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-20, -68); ctx.lineTo(-4, -61); ctx.moveTo(20, -68); ctx.lineTo(4, -61); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -34, 10, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); // grumpy mouth
    ctx.restore();
  }

  function drawCorrupted(ctx, o, t) {
    const w = o.width, h = o.type.top;
    ctx.save();
    ctx.fillStyle = '#20242e';
    ctx.fillRect(-w / 2, -h, w, h);
    const colors = ['#ff1744', '#00e5ff', '#ffd600', '#455a64'];
    for (let i = 0; i < 10; i++) {
      const off = ((o.seed * (i + 3)) % 1 - 0.5) * 16 + Math.sin(t * 12 + i) * 3;
      ctx.fillStyle = colors[i % colors.length];
      ctx.globalAlpha = 0.75;
      ctx.fillRect(-w / 2 + off + 6, -h + i * 20 + 3, w - 24 + (i % 3) * 6, 9);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#ff1744'; ctx.lineWidth = 3;
    ctx.strokeRect(-w / 2, -h, w, h);
    ctx.lineWidth = 6;                               // big X
    ctx.beginPath(); ctx.moveTo(-26, -h / 2 - 26); ctx.lineTo(26, -h / 2 + 26); ctx.moveTo(26, -h / 2 - 26); ctx.lineTo(-26, -h / 2 + 26); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `bold 13px ${CONFIG.fontFamily}`; ctx.textAlign = 'center';
    ctx.fillText('CORRUPTED', 0, -h + 16);
    ctx.restore();
  }

  function drawBarrierLow(ctx, o, t) {
    const w = o.width, h = o.type.top;
    const flick = 0.7 + 0.3 * Math.sin(t * 25 + o.seed * 10);
    ctx.save();
    ctx.fillStyle = '#37474f';
    ctx.fillRect(-w / 2, -h, 12, h);
    ctx.fillRect(w / 2 - 12, -h, 12, h);
    ctx.shadowColor = '#ff1744'; ctx.shadowBlur = 14;
    ctx.fillStyle = `rgba(255,23,68,${flick})`;
    ctx.fillRect(-w / 2 + 12, -32, w - 24, 8);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffd600';                       // warning plate
    roundRectPath(ctx, -22, -h, 44, 20, 4); ctx.fill();
    ctx.fillStyle = '#111'; ctx.font = `bold 13px ${CONFIG.fontFamily}`; ctx.textAlign = 'center';
    ctx.fillText('ERR', 0, -h + 15);
    ctx.restore();
  }

  function drawBarrierHigh(ctx, o, t) {
    const w = o.width, b = o.type.bottom, top = o.type.top;
    const flick = 0.75 + 0.25 * Math.sin(t * 20 + o.seed * 10);
    ctx.save();
    ctx.fillStyle = '#37474f';                       // posts
    ctx.fillRect(-w / 2, -b, 8, b);
    ctx.fillRect(w / 2 - 8, -b, 8, b);
    ctx.fillStyle = '#263238';                       // overhead panel
    ctx.fillRect(-w / 2, -top, w, top - b);
    ctx.save();                                      // hazard stripes along the bottom edge
    ctx.beginPath(); ctx.rect(-w / 2, -b - 14, w, 14); ctx.clip();
    ctx.fillStyle = '#ffd600'; ctx.fillRect(-w / 2, -b - 14, w, 14);
    ctx.fillStyle = '#111';
    for (let x = -w / 2 - 14; x < w / 2; x += 28) {
      ctx.beginPath(); ctx.moveTo(x, -b); ctx.lineTo(x + 14, -b); ctx.lineTo(x + 28, -b - 14); ctx.lineTo(x + 14, -b - 14); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.shadowColor = '#ff1744'; ctx.shadowBlur = 14;
    ctx.fillStyle = `rgba(255,23,68,${flick})`;
    ctx.fillRect(-w / 2, -b - 2, w, 4);              // laser beam
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ff5252'; ctx.font = `bold 14px ${CONFIG.fontFamily}`; ctx.textAlign = 'center';
    ctx.fillText('SYSTEM', 0, -top + 40);
    ctx.fillText('ERROR', 0, -top + 60);
    ctx.restore();
  }

  /* --- Collectible drawing (local coords: origin = item centre) --- */
  function drawDataPacket(ctx, c, t) {
    ctx.save();
    ctx.rotate(Math.sin(t * 2 + c.phase) * 0.15);
    ctx.fillStyle = '#00bcd4';
    roundRectPath(ctx, -22, -22, 44, 44, 8); ctx.fill();
    ctx.strokeStyle = '#e0f7fa'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#e0f7fa'; ctx.font = `bold 16px ${CONFIG.fontFamily}`; ctx.textAlign = 'center';
    ctx.fillText('01', 0, -2); ctx.fillText('10', 0, 15);
    ctx.restore();
  }

  function drawTrainingCore(ctx, c, t) {
    ctx.save();
    ctx.fillStyle = '#ff9100';
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffe0b2'; ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(0, 0, 25, 9, t * 2 + (i * Math.PI) / 3 + c.phase, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDeploymentKey(ctx, c, t) {
    ctx.save();
    ctx.rotate(-0.5 + Math.sin(t * 2 + c.phase) * 0.12);
    ctx.fillStyle = '#ffd740';
    ctx.strokeStyle = '#fff3c4'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(-14, 0, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillRect(-4, -4, 30, 8);                     // shaft
    ctx.fillRect(14, 4, 6, 10); ctx.fillRect(23, 4, 5, 8); // teeth
    ctx.fillStyle = '#7a5b00';
    ctx.beginPath(); ctx.arc(-14, 0, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /* ===================================================================
     4. ASSETS & SOUND
     =================================================================== */
  class Assets {
    constructor(manifest) {
      this.images = {};
      for (const [key, path] of Object.entries(manifest.images)) {
        if (!path) continue;
        const img = new Image();
        img.onload = () => { this.images[key] = img; };
        img.onerror = () => { delete this.images[key]; };   // graceful fallback
        img.src = path;
      }
    }
    getImage(key) {
      const img = this.images[key];
      return img && img.naturalWidth > 0 ? img : null;
    }
  }

  // Tiny generated sound effects used when no local sound file is configured.
  const SYNTH_SOUNDS = {
    collect: [[880, 0, 0.07, 'sine'], [1320, 0.06, 0.1, 'sine']],
    hit: [[140, 0, 0.25, 'sawtooth'], [90, 0.08, 0.3, 'square']],
    jump: [[400, 0, 0.12, 'triangle']],
    slide: [[220, 0, 0.12, 'triangle']],
    correct: [[660, 0, 0.1, 'sine'], [880, 0.1, 0.1, 'sine'], [1100, 0.2, 0.18, 'sine']],
    wrong: [[220, 0, 0.2, 'square'], [165, 0.15, 0.25, 'square']],
    stage: [[520, 0, 0.12, 'sine'], [780, 0.12, 0.2, 'sine']],
    victory: [[523, 0, 0.15, 'sine'], [659, 0.15, 0.15, 'sine'], [784, 0.3, 0.15, 'sine'], [1047, 0.45, 0.3, 'sine']],
    gameover: [[300, 0, 0.2, 'sawtooth'], [220, 0.2, 0.2, 'sawtooth'], [150, 0.4, 0.4, 'sawtooth']],
  };

  class SoundManager {
    constructor(cfg) {
      this.cfg = cfg;
      this.files = {};
      this.failed = new Set();
      this.ctx = null;
      this.preloaded = false;
    }
    // Must be called from a user gesture (Start button) for iOS/Chrome autoplay rules.
    unlock() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) { try { this.ctx = new AC(); } catch (e) { this.ctx = null; } }
      }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => { });
    }
    preload() {
      if (this.preloaded) return;
      this.preloaded = true;
      for (const [name, path] of Object.entries(this.cfg.sounds)) {
        if (!path) continue;
        try {
          const a = new Audio();
          a.preload = 'auto';
          a.addEventListener('error', () => this.failed.add(name));
          a.src = path;
          this.files[name] = a;
        } catch (e) { this.failed.add(name); }
      }
    }
    play(name) {
      const a = this.files[name];
      if (a && !this.failed.has(name)) {
        try {
          const clone = a.cloneNode();
          clone.volume = this.cfg.soundVolume;
          const p = clone.play();
          if (p && p.catch) p.catch(() => this.synth(name));
          return;
        } catch (e) { /* fall through to synth */ }
      }
      this.synth(name);
    }
    synth(name) {
      if (!this.cfg.synthFallback || !this.ctx) return;
      const pattern = SYNTH_SOUNDS[name];
      if (!pattern) return;
      const now = this.ctx.currentTime;
      pattern.forEach(([freq, start, dur, type]) => {
        try {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = type;
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.0001, now + start);
          gain.gain.exponentialRampToValueAtTime(0.08, now + start + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
          osc.connect(gain); gain.connect(this.ctx.destination);
          osc.start(now + start); osc.stop(now + start + dur + 0.02);
        } catch (e) { /* ignore audio errors */ }
      });
    }
  }

  /* ===================================================================
     5. PLAYER CONTROLLER
     =================================================================== */
  class Player {
    constructor(cfg, hooks) {
      this.cfg = cfg;
      this.hooks = hooks || {};
      this.width = cfg.width;
      this.depth = cfg.depth;
      this.reset();
    }
    reset() {
      this.lane = 0;          // target lane (-1, 0, 1) — starts in the centre
      this.x = 0;             // smooth lane position
      this.jumpTime = -1;     // -1 = not jumping
      this.slideTime = -1;    // -1 = not sliding
      this.height = 0;        // height above ground
      this.buffered = null;   // queued 'jump' | 'slide'
      this.bufferTtl = 0;
      this.runPhase = 0;
    }
    get isJumping() { return this.jumpTime >= 0; }
    get isSliding() { return this.slideTime >= 0; }
    get hitHeight() { return this.isSliding ? this.cfg.slideHeight : this.cfg.standHeight; }

    moveLeft() { this.lane = clamp(this.lane - 1, -1, 1); }
    moveRight() { this.lane = clamp(this.lane + 1, -1, 1); }

    jump() {
      if (this.isJumping || this.isSliding) return this.queue('jump');
      this.jumpTime = 0;
      if (this.hooks.onJump) this.hooks.onJump();
      return true;
    }
    slide() {
      if (this.isSliding) return false;
      if (this.isJumping) return this.queue('slide');
      this.slideTime = 0;
      if (this.hooks.onSlide) this.hooks.onSlide();
      return true;
    }
    // Remember a quick press for a moment so it fires as soon as the player is free.
    queue(action) {
      this.buffered = action;
      this.bufferTtl = this.cfg.inputBufferSeconds;
      return false;
    }
    update(dt) {
      const c = this.cfg;
      this.x += (this.lane - this.x) * (1 - Math.exp(-c.laneSharpness * dt));
      if (Math.abs(this.lane - this.x) < 0.002) this.x = this.lane;
      this.runPhase += dt * 14;

      if (this.isJumping) {
        this.jumpTime += dt;
        const u = this.jumpTime / c.jumpDuration;
        if (u >= 1) { this.jumpTime = -1; this.height = 0; }
        else this.height = 4 * c.jumpHeight * u * (1 - u);   // parabola
      }
      if (this.isSliding) {
        this.slideTime += dt;
        if (this.slideTime >= c.slideDuration) this.slideTime = -1;
      }
      if (this.buffered) {
        this.bufferTtl -= dt;
        if (this.bufferTtl <= 0) this.buffered = null;
        else if (!this.isJumping && !this.isSliding) {
          const a = this.buffered;
          this.buffered = null;
          if (a === 'jump') this.jump(); else this.slide();
        }
      }
    }
  }

  /* ===================================================================
     6. OBSTACLE MANAGER
     Rules: every row leaves at least one lane free of obstacles,
     rows are never closer than minRowInterval, density rises over time,
     and obstacles keep a clearance from collectibles.
     =================================================================== */
  class ObstacleManager {
    constructor(cfg) {
      this.cfg = cfg;
      this.list = [];
      this.timer = 0;
    }
    reset() {
      this.list.length = 0;
      this.timer = this.cfg.firstSpawnDelay;
    }
    update(dt, speed, ctx) {
      // move + cleanup (iterate backwards so splice is safe)
      for (let i = this.list.length - 1; i >= 0; i--) {
        const o = this.list[i];
        o.prevZ = o.z;
        o.z -= speed * dt;
        if (o.z < CONFIG.view.despawnDistance) this.list.splice(i, 1);
      }
      if (!ctx.spawn) return;
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.spawnRow(ctx.stageIndex, ctx.collectibles)) {
          this.timer = this.nextInterval(ctx.stageIndex, ctx.elapsed);
        } else {
          this.timer = 0.15; // blocked by a collectible; try again shortly
        }
      }
    }
    nextInterval(stageIndex, elapsed) {
      const sc = this.cfg.stages[stageIndex];
      const density = lerp(1, this.cfg.densityEndScale, clamp(elapsed / CONFIG.totalDuration, 0, 1));
      return Math.max(this.cfg.minRowInterval, rand(sc.interval[0], sc.interval[1]) * density);
    }
    spawnRow(stageIndex, collectibles) {
      const sc = this.cfg.stages[stageIndex];
      const Z = CONFIG.view.spawnDistance;
      const clearance = this.cfg.collectibleClearance;
      const free = LANES.filter((l) =>
        !collectibles.some((c) => c.lane === l && Math.abs(c.z - Z) < clearance));
      if (free.length === 0) return false;

      const typeId = pickWeighted(sc.weights);
      const type = OBSTACLE_TYPES[typeId];

      // Wide barrier across two neighbouring lanes (third lane stays free)
      if (type.multiLane && Math.random() < sc.wideBarrierChance) {
        const pairs = [[-1, 0], [0, 1]].filter((p) => p.every((l) => free.includes(l)));
        if (pairs.length) {
          this.add(typeId, pairs[randInt(0, pairs.length - 1)], Z);
          return true;
        }
      }
      // One or two single-lane obstacles (never all three lanes)
      const wantDouble = Math.random() < sc.doubleRowChance && free.length >= 2;
      const lanes = shuffle(free.slice()).slice(0, wantDouble ? 2 : 1);
      lanes.forEach((lane, i) => this.add(i === 0 ? typeId : pickWeighted(sc.weights), [lane], Z));
      return true;
    }
    add(typeId, lanes, z) {
      const type = OBSTACLE_TYPES[typeId];
      this.list.push({
        kind: 'obstacle',
        typeId,
        type,
        lanes,
        laneX: lanes.reduce((a, b) => a + b, 0) / lanes.length,
        width: lanes.length > 1 ? lanes.length * CONFIG.view.laneWidth - 40 : type.width,
        z,
        prevZ: z,
        hit: false,
        seed: Math.random(),
      });
    }
  }

  /* ===================================================================
     7. COLLECTIBLE MANAGER
     10 items per stage are scheduled evenly between firstSpawnAt and
     lastSpawnAt, so exactly 30 appear in a full game.
     =================================================================== */
  class CollectibleManager {
    constructor(cfg) {
      this.cfg = cfg;
      this.list = [];
      this.spawned = [0, 0, 0];
      this.lastLane = null;
    }
    reset() {
      this.list.length = 0;
      this.spawned = CONFIG.stages.map(() => 0);
      this.lastLane = null;
    }
    scheduleTime(i) {
      const { firstSpawnAt, lastSpawnAt, perStage } = this.cfg;
      return firstSpawnAt + (i * (lastSpawnAt - firstSpawnAt)) / (perStage - 1);
    }
    update(dt, speed, ctx) {
      for (let i = this.list.length - 1; i >= 0; i--) {
        const c = this.list[i];
        c.prevZ = c.z;
        c.z -= speed * dt;
        if (c.z < CONFIG.view.despawnDistance) this.list.splice(i, 1);
      }
      if (!ctx.spawn) return;
      const n = this.spawned[ctx.stageIndex];
      if (n >= this.cfg.perStage || ctx.stageElapsed < this.scheduleTime(n)) return;

      const Z = CONFIG.view.spawnDistance;
      const clearance = CONFIG.obstacles.collectibleClearance;
      let candidates = LANES.filter((l) =>
        !ctx.obstacles.some((o) => o.lanes.includes(l) && Math.abs(o.z - Z) < clearance));
      if (candidates.length === 0) return;           // retry next frame
      const varied = candidates.filter((l) => l !== this.lastLane);
      if (varied.length) candidates = varied;        // avoid long streaks in one lane
      const lane = candidates[randInt(0, candidates.length - 1)];
      this.lastLane = lane;
      this.spawned[ctx.stageIndex]++;
      this.list.push({
        kind: 'collectible',
        typeId: CONFIG.stages[ctx.stageIndex].collectible,
        stageIndex: ctx.stageIndex,
        lane,
        laneX: lane,
        z: Z,
        prevZ: Z,
        phase: Math.random() * 6,
      });
    }
    // Removes and returns every collectible the player is touching.
    collectTouching(player) {
      const got = [];
      for (let i = this.list.length - 1; i >= 0; i--) {
        if (Collision.touchesCollectible(player, this.list[i])) got.push(this.list.splice(i, 1)[0]);
      }
      return got;
    }
  }

  /* ===================================================================
     8. COLLISION DETECTION
     z axis uses a swept test (prevZ -> z) so fast frames never tunnel.
     =================================================================== */
  const Collision = {
    overlapsDepth(item, itemDepth, playerDepth) {
      const half = itemDepth / 2, pHalf = playerDepth / 2;
      return item.z - half < pHalf && item.prevZ + half > -pHalf;
    },
    overlapsLane(player, laneX, width, tolerance) {
      const dx = Math.abs(player.x - laneX) * CONFIG.view.laneWidth;
      return dx < (width + player.width) / 2 - tolerance;
    },
    hitsObstacle(player, o) {
      if (!this.overlapsDepth(o, o.type.depth, player.depth)) return false;
      if (!this.overlapsLane(player, o.laneX, o.width, CONFIG.obstacles.hitTolerance)) return false;
      const pBottom = player.height;
      const pTop = player.height + player.hitHeight;
      return pBottom < o.type.top && pTop > o.type.bottom;   // vertical overlap
    },
    touchesCollectible(player, c) {
      const cc = CONFIG.collectibles;
      return this.overlapsDepth(c, cc.depth, player.depth) &&
        this.overlapsLane(player, c.laneX, cc.width, cc.hitTolerance);
    },
  };

  /* ===================================================================
     9. STAGE MANAGER
     =================================================================== */
  class StageManager {
    constructor() { this.index = 0; }
    reset() { this.index = 0; }
    get current() { return CONFIG.stages[this.index]; }
    get isLast() { return this.index === CONFIG.stages.length - 1; }
    advance() { if (!this.isLast) this.index++; }
    stageElapsed(elapsed) { return elapsed - this.index * CONFIG.stageDuration; }
    // Speed rises per stage, ramps inside a stage, and surges near the finish.
    // `questionBoost` = total speed earned from answered questions (never resets).
    targetSpeed(elapsed, questionBoost = 0) {
      const sp = CONFIG.speed;
      const p = clamp(this.stageElapsed(elapsed) / CONFIG.stageDuration, 0, 1);
      let v = sp.perStage[this.index] + sp.inStageRamp * p + questionBoost;
      if (this.isLast && elapsed > CONFIG.totalDuration - 20) v += sp.urgencyBoost;
      return Math.min(v, sp.max);
    }
  }

  /* ===================================================================
     10. AI PROGRESS MANAGER
     Progress is always derived from the real number of collected items.
     =================================================================== */
  class AIProgressManager {
    constructor() { this.reset(); }
    reset() { this.collected = CONFIG.stages.map(() => 0); }
    collect(stageIndex) {
      if (this.collected[stageIndex] >= CONFIG.collectibles.perStage) return false;
      this.collected[stageIndex]++;
      return true;
    }
    percent(stageIndex) {
      return clamp((this.collected[stageIndex] / CONFIG.collectibles.perStage) * 100, 0, 100);
    }
    get totalCollected() { return this.collected.reduce((a, b) => a + b, 0); }
    get isComplete() { return CONFIG.stages.every((_, i) => this.percent(i) >= 100); }
  }

  /* ===================================================================
     11. QUIZ MANAGER
     =================================================================== */
  class QuizManager {
    constructor(questions, els, sound) {
      this.questions = questions;
      this.els = els;
      this.sound = sound;
      this.autoCloseId = 0;
      this.onAnswered = null;      // set by Game: called exactly once per answered question
      this.reset();
    }
    reset() {
      this.correctCount = 0;
      this.answeredGates = new Set();
      this.active = null;
      clearTimeout(this.autoCloseId);
      this.clearUi();
    }
    clearUi() {
      setHidden(this.els.gateQuestion, true);
      if (this.els.quizOptions) this.els.quizOptions.textContent = '';
      if (this.els.quizFeedback) this.els.quizFeedback.textContent = '';
      setHidden(this.els.continueBtn, true);
    }
    open(gateIndex, onClose) {
      if (this.answeredGates.has(gateIndex)) { onClose(); return; }
      const q = this.questions[gateIndex % this.questions.length];
      this.active = { gateIndex, q, answered: false, onClose };

      this.clearUi();
      if (this.els.questionText) this.els.questionText.textContent = q.question;
      const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
      const order = q.options.map((_, i) => i);
      if (CONFIG.quiz.shuffleOptions && q.options.length > 2) shuffle(order);
      order.forEach((origIdx, pos) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'quiz-option';
        btn.dataset.optionIndex = String(origIdx);
        btn.textContent = `${letters[pos]}. ${q.options[origIdx]}`;
        btn.addEventListener('click', () => this.answer(origIdx));
        if (this.els.quizOptions) this.els.quizOptions.appendChild(btn);
      });
      setHidden(this.els.gateQuestion, false);
    }
    // Answer by on-screen position (used by keyboard shortcuts 1-9)
    answerByPosition(pos) {
      const box = this.els.quizOptions;
      if (!box || !box.children[pos]) return;
      this.answer(Number(box.children[pos].dataset.optionIndex));
    }
    answer(origIdx) {
      const a = this.active;
      if (!a || a.answered) return;            // each question can be answered only once
      a.answered = true;
      this.answeredGates.add(a.gateIndex);
      const correct = origIdx === a.q.correctIndex;
      if (correct) this.correctCount++;
      this.sound.play(correct ? 'correct' : 'wrong');
      if (this.onAnswered) this.onAnswered(correct);   // speed boost etc. (once per question)

      if (this.els.quizOptions) {
        Array.from(this.els.quizOptions.children).forEach((btn) => {
          const idx = Number(btn.dataset.optionIndex);
          btn.disabled = true;
          if (idx === a.q.correctIndex) btn.classList.add('is-correct');
          else if (idx === origIdx) btn.classList.add('is-wrong');
        });
      }
      if (this.els.quizFeedback) {
        const extra = a.q.explanation ? ` ${a.q.explanation}` : '';
        this.els.quizFeedback.textContent = correct
          ? `Correct! +${CONFIG.scoring.quizPerCorrect} points${extra}`
          : `Not quite. The correct answer: ${a.q.options[a.q.correctIndex]}.${extra}`;
        this.els.quizFeedback.classList.toggle('is-correct', correct);
        this.els.quizFeedback.classList.toggle('is-wrong', !correct);
      }
      if (this.els.continueBtn) {
        setHidden(this.els.continueBtn, false);
        try { this.els.continueBtn.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      } else {
        // No Continue button in the HTML: continue automatically.
        this.autoCloseId = setTimeout(() => this.close(), 1600);
      }
    }
    close() {
      const a = this.active;
      if (!a || !a.answered) return;           // cannot skip without answering
      this.active = null;
      clearTimeout(this.autoCloseId);
      this.clearUi();
      a.onClose();
    }
  }

  /* ===================================================================
     12. SCORE MANAGER  (pure logic — independent from the display)
     =================================================================== */
  class ScoreManager {
    constructor(cfg) { this.cfg = cfg; }
    compute({ collected, correct, collisions, finished }) {
      const c = this.cfg;
      // 1 point per item; the full 30 only when all 30 are collected
      const collectibles = Math.floor(clamp(collected, 0, TOTAL_COLLECTIBLES) / TOTAL_COLLECTIBLES * c.collectibles);
      const quiz = clamp(correct, 0, CONFIG.quiz.gates.length) * c.quizPerCorrect;
      const noCollision = finished && collisions === 0 ? c.noCollision : 0;
      const completion = finished ? c.finish : 0;
      const total = Math.min(c.max, collectibles + quiz + noCollision + completion);
      return { collectibles, quiz, noCollision, completion, total };
    }
  }

  /* ===================================================================
     13. GAME STATE MANAGER
     =================================================================== */
  class GameStateManager {
    constructor(onChange) {
      this.current = STATE.START;
      this.onChange = onChange;
    }
    is(...states) { return states.includes(this.current); }
    set(next) {
      if (next === this.current) return;
      const prev = this.current;
      this.current = next;
      this.onChange(prev, next);
    }
  }

  /* ===================================================================
     14. UI (all DOM access lives here)
     Every element is optional: a missing element only logs a warning.
     =================================================================== */
  const ELEMENT_IDS = {
    startScreen: 'start-screen', gameScreen: 'game-screen', endScreen: 'end-screen',
    canvas: 'game-canvas',
    startBtn: 'start-btn', restartBtn: 'restart-btn', fullscreenBtn: 'fullscreen-btn',
    pauseBtn: 'pause-btn', resumeBtn: 'resume-btn', continueBtn: 'continue-btn',
    score: 'score', batteries: 'batteries', stage: 'stage', gameTimer: 'game-timer',
    dataProgress: 'data-progress', dataPercentage: 'data-percentage',
    trainingProgress: 'training-progress', trainingPercentage: 'training-percentage',
    deploymentProgress: 'deployment-progress', deploymentPercentage: 'deployment-percentage',
    gateQuestion: 'gate-question', questionText: 'question-text',
    quizOptions: 'quiz-options', quizFeedback: 'quiz-feedback',
    finalScore: 'final-score', endMessage: 'end-message',
    collectiblesScore: 'collectibles-score', quizScore: 'quiz-score',
    collisionBonus: 'collision-bonus', completionBonus: 'completion-bonus',
    collectedCount: 'collected-count', correctAnswers: 'correct-answers',
    collisionCount: 'collision-count',
  };
  // Optional extra element (not in the agreement). Used if it exists.
  const OPTIONAL_IDS = { pauseOverlay: 'pause-screen', pauseHomeBtn: 'pause-home-btn', endHomeBtn: 'end-home-btn' };

  function bindElements() {
    const els = {};
    const missing = [];
    for (const [key, id] of Object.entries(ELEMENT_IDS)) {
      els[key] = document.getElementById(id);
      if (!els[key]) missing.push(id);
    }
    for (const [key, id] of Object.entries(OPTIONAL_IDS)) els[key] = document.getElementById(id);
    if (missing.length) console.warn('[Dev Run] Missing HTML elements (ask the HTML teammate to add them):', missing.join(', '));
    return els;
  }

  class UI {
    constructor(els) {
      this.els = els;
      this.hitTimeout = 0;
      this.cache = {};
    }
    setText(key, value) {
      const el = this.els[key];
      if (!el) return;
      const str = String(value);
      if (this.cache[key] !== str) { this.cache[key] = str; el.textContent = str; }
    }
    setProgress(progressKey, percentKey, pct) {
      const rounded = Math.round(pct);
      const el = this.els[progressKey];
      if (el) {
        if (el.tagName === 'PROGRESS' || el.tagName === 'METER') {
          el.max = 100; el.value = pct;
        } else {
          // Works if data-progress is the fill itself OR a bar containing .progress-fill
          const fill = el.classList.contains('progress-fill') ? el : (el.querySelector('.progress-fill') || el);
          fill.style.width = `${pct}%`;
        }
        el.setAttribute('aria-valuenow', String(rounded));
      }
      this.setText(percentKey, `${rounded}%`);
    }
    updateProgress(progress) {
      this.setProgress('dataProgress', 'dataPercentage', progress.percent(0));
      this.setProgress('trainingProgress', 'trainingPercentage', progress.percent(1));
      this.setProgress('deploymentProgress', 'deploymentPercentage', progress.percent(2));
    }
    updateHud({ score, remaining, lives, stageName }) {
      this.setText('score', score);
      this.setText('gameTimer', formatTime(remaining));
      this.setText('stage', stageName);
      this.setText('batteries', lives > 0 ? '🔋'.repeat(lives) : '0');
      if (this.els.batteries) this.els.batteries.setAttribute('data-lives', String(lives));
    }
    flashHit() {
      const el = this.els.gameScreen;
      if (!el) return;
      el.classList.add('is-hit');
      clearTimeout(this.hitTimeout);
      this.hitTimeout = setTimeout(() => el.classList.remove('is-hit'), 450);
    }
    clearHit() {
      clearTimeout(this.hitTimeout);
      if (this.els.gameScreen) this.els.gameScreen.classList.remove('is-hit');
    }
    // Decides which screen / overlay is visible for each game state.
    applyState(state) {
      const e = this.els;
      const showGame = state !== STATE.START && state !== STATE.GAME_OVER && state !== STATE.VICTORY;
      setHidden(e.startScreen, state !== STATE.START);
      setHidden(e.gameScreen, !showGame);
      setHidden(e.endScreen, !(state === STATE.GAME_OVER || state === STATE.VICTORY));
      setHidden(e.pauseOverlay, state !== STATE.PAUSED);
      setHidden(e.resumeBtn, state !== STATE.PAUSED);
      if (state !== STATE.QUIZ) setHidden(e.gateQuestion, true);
      if (e.pauseBtn) e.pauseBtn.disabled = !RUNNING_STATES.has(state);
      document.body.setAttribute('data-game-state', state);
      if (e.gameScreen) e.gameScreen.setAttribute('data-game-state', state);
      // keep the page from bouncing/scrolling while playing
      document.body.style.overscrollBehavior = showGame ? 'none' : '';
    }
    showResults(r) {
      const sc = CONFIG.scoring;
      this.setText('finalScore', `${r.breakdown.total} / ${sc.max}`);
      this.setText('endMessage', r.message);
      this.setText('collectiblesScore', `${r.breakdown.collectibles} / ${sc.collectibles}`);
      this.setText('quizScore', `${r.breakdown.quiz} / ${sc.quizPerCorrect * CONFIG.quiz.gates.length}`);
      this.setText('collisionBonus', `${r.breakdown.noCollision} / ${sc.noCollision}`);
      this.setText('completionBonus', `${r.breakdown.completion} / ${sc.finish}`);
      this.setText('collectedCount', `${r.collected} / ${TOTAL_COLLECTIBLES}`);
      this.setText('correctAnswers', `${r.correct} / ${CONFIG.quiz.gates.length}`);
      this.setText('collisionCount', r.collisions);
      if (this.els.endScreen) {
        this.els.endScreen.classList.toggle('is-victory', r.victory);
        this.els.endScreen.classList.toggle('is-defeat', !r.victory);
      }
    }
  }

  /* ===================================================================
     15. INPUT CONTROLLER (keyboard + touch swipe, with cleanup)
     =================================================================== */
  class InputController {
    constructor(els, game) {
      this.els = els;
      this.game = game;
      this.touch = null;
      this.onKeyDown = this.onKeyDown.bind(this);
      this.onTouchStart = this.onTouchStart.bind(this);
      this.onTouchMove = this.onTouchMove.bind(this);
      this.onTouchEnd = this.onTouchEnd.bind(this);
      this.onContextMenu = (e) => e.preventDefault();
    }
    attach() {
      document.addEventListener('keydown', this.onKeyDown);
      const t = this.els.gameScreen;
      if (t) {
        t.style.touchAction = 'none';
        t.addEventListener('touchstart', this.onTouchStart, { passive: false });
        t.addEventListener('touchmove', this.onTouchMove, { passive: false });
        t.addEventListener('touchend', this.onTouchEnd);
        t.addEventListener('touchcancel', this.onTouchEnd);
        t.addEventListener('contextmenu', this.onContextMenu);
      }
      if (this.els.canvas) this.els.canvas.style.touchAction = 'none';
    }
    detach() {
      document.removeEventListener('keydown', this.onKeyDown);
      const t = this.els.gameScreen;
      if (t) {
        t.removeEventListener('touchstart', this.onTouchStart);
        t.removeEventListener('touchmove', this.onTouchMove);
        t.removeEventListener('touchend', this.onTouchEnd);
        t.removeEventListener('touchcancel', this.onTouchEnd);
        t.removeEventListener('contextmenu', this.onContextMenu);
      }
    }
    onKeyDown(e) {
      const g = this.game;
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (g.states.is(STATE.PLAYING, STATE.STAGE_TRANSITION, STATE.PAUSED)) {
          e.preventDefault();
          if (!e.repeat) g.togglePause();
        }
        return;
      }
      if (g.states.is(STATE.QUIZ)) {                      // keys 1..9 choose an answer
        const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
        if (m && !e.repeat) g.quiz.answerByPosition(Number(m[1]) - 1);
        return;
      }
      if (!g.canControl()) return;
      let handled = true;
      switch (e.code) {
        case 'ArrowLeft': case 'KeyA': if (!e.repeat) g.player.moveLeft(); break;
        case 'ArrowRight': case 'KeyD': if (!e.repeat) g.player.moveRight(); break;
        case 'ArrowUp': case 'KeyW': case 'Space': if (!e.repeat) g.player.jump(); break;
        case 'ArrowDown': case 'KeyS': if (!e.repeat) g.player.slide(); break;
        default: handled = false;
      }
      if (handled) e.preventDefault();                    // stop page scrolling
    }
    onTouchStart(e) {
      if (!this.game.canControl()) { this.touch = null; return; }
      if (e.target.closest && e.target.closest('button')) { this.touch = null; return; }
      const t = e.changedTouches[0];
      this.touch = { id: t.identifier, x: t.clientX, y: t.clientY, done: false };
      e.preventDefault();
    }
    onTouchMove(e) {
      if (!this.game.canControl()) return;
      e.preventDefault();                                 // no scrolling during play
      const s = this.touch;
      if (!s || s.done) return;
      for (const t of e.changedTouches) {
        if (t.identifier !== s.id) continue;
        const dx = t.clientX - s.x, dy = t.clientY - s.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < CONFIG.swipeThreshold) return;
        s.done = true;                                    // one action per swipe
        const p = this.game.player;
        if (Math.abs(dx) > Math.abs(dy)) { if (dx < 0) p.moveLeft(); else p.moveRight(); }
        else if (dy < 0) p.jump();
        else p.slide();
      }
    }
    onTouchEnd() { this.touch = null; }
  }

  /* ===================================================================
     16. RENDERER (single existing canvas, pseudo-3D road)
     =================================================================== */
  class Renderer {
    constructor(canvas, assets) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.assets = assets;
      canvas.width = CONFIG.canvas.width;
      canvas.height = CONFIG.canvas.height;
      this.W = canvas.width;
      this.H = canvas.height;
      this.cx = this.W / 2;
      this.accent = Object.assign({}, CONFIG.stages[0].rgb);
      this.proj = { x: 0, y: 0, s: 1 };
      this.list = [];
      this.bits = Array.from({ length: 36 }, (_, i) => ({
        x: (i * 97) % this.W, y: (i * 53) % CONFIG.view.horizonY, sp: 20 + ((i * 13) % 40), size: 1 + (i % 3),
      }));
      this.skyline = Array.from({ length: 14 }, (_, i) => ({
        x: i * 42 - 10, w: 30 + ((i * 17) % 20), h: 20 + ((i * 29) % 50),
      }));
    }

    project(laneX, z) {
      const V = CONFIG.view;
      const sc = V.perspective / (V.perspective + z);
      const p = this.proj;
      p.s = sc;
      p.x = this.cx + laneX * V.laneWidth * sc;
      p.y = V.horizonY + (V.groundY - V.horizonY) * sc;
      return p;
    }

    draw(game, dt) {
      const ctx = this.ctx, s = game.session;
      const target = game.stages.current.rgb;
      const k = 1 - Math.exp(-3 * dt);                    // smooth colour change between stages
      this.accent.r += (target.r - this.accent.r) * k;
      this.accent.g += (target.g - this.accent.g) * k;
      this.accent.b += (target.b - this.accent.b) * k;

      ctx.save();
      if (s.shake > 0) {
        const m = s.shake * 18;
        ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
      }
      this.drawBackground(s);
      this.drawRoad(s);
      this.drawScenery(s);
      this.drawEntities(game);
      ctx.restore();
      this.drawParticles(s);
      this.drawOverlays(game);
    }

    drawBackground(s) {
      const ctx = this.ctx, a = this.accent, V = CONFIG.view, W = this.W, H = this.H;
      ctx.fillStyle = '#03050d';
      ctx.fillRect(-30, -30, W + 60, H + 60);
      const g = ctx.createLinearGradient(0, 0, 0, V.horizonY + 40);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, rgba(a, 0.3));
      ctx.fillStyle = g;
      ctx.fillRect(-30, 0, W + 60, V.horizonY + 40);
      // falling data bits in the sky
      ctx.fillStyle = rgba(a, 0.5);
      for (const b of this.bits) {
        ctx.fillRect(b.x, (b.y + s.time * b.sp) % V.horizonY, b.size, b.size * 3);
      }
      // distant skyline
      ctx.fillStyle = rgba(a, 0.14);
      for (const b of this.skyline) ctx.fillRect(b.x, V.horizonY - b.h, b.w, b.h);
      ctx.fillStyle = '#060913';
      ctx.fillRect(-30, V.horizonY, W + 60, H);
      const glow = ctx.createLinearGradient(0, V.horizonY - 30, 0, V.horizonY + 50);
      glow.addColorStop(0, 'rgba(0,0,0,0)');
      glow.addColorStop(0.5, rgba(a, 0.45));
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(-30, V.horizonY - 30, W + 60, 80);
    }

    drawRoad(s) {
      const ctx = this.ctx, a = this.accent, V = CONFIG.view, H = this.H, cx = this.cx;
      const half = 1.5 * V.laneWidth;
      const sTop = 0.03;
      const sBot = (H - V.horizonY) / (V.groundY - V.horizonY);
      const yTop = V.horizonY + (V.groundY - V.horizonY) * sTop;

      const g = ctx.createLinearGradient(0, yTop, 0, H);
      g.addColorStop(0, '#0a1124');
      g.addColorStop(1, '#17233f');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx - half * sTop, yTop); ctx.lineTo(cx + half * sTop, yTop);
      ctx.lineTo(cx + half * sBot, H); ctx.lineTo(cx - half * sBot, H);
      ctx.closePath(); ctx.fill();

      // neon road edges
      ctx.save();
      ctx.strokeStyle = rgba(a, 0.9); ctx.lineWidth = 3;
      ctx.shadowColor = rgba(a, 1); ctx.shadowBlur = 10;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + side * half * sTop, yTop); ctx.lineTo(cx + side * half * sBot, H);
        ctx.stroke();
      }
      ctx.restore();
      // lane dividers
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2;
      for (const lx of [-0.5, 0.5]) {
        ctx.beginPath();
        ctx.moveTo(cx + lx * V.laneWidth * sTop, yTop); ctx.lineTo(cx + lx * V.laneWidth * sBot, H);
        ctx.stroke();
      }
      // moving grid lines give the feeling of speed
      const spacing = 140, off = s.distance % spacing, maxZ = 2400;
      ctx.lineWidth = 2;
      for (let k = -1; k * spacing - off < maxZ; k++) {
        const z = k * spacing - off;
        if (z < -200) continue;
        const sc = V.perspective / (V.perspective + z);
        const y = V.horizonY + (V.groundY - V.horizonY) * sc;
        if (y > H) continue;
        ctx.strokeStyle = rgba(a, clamp(sc * 0.8, 0.05, 0.45));
        ctx.beginPath(); ctx.moveTo(cx - half * sc, y); ctx.lineTo(cx + half * sc, y); ctx.stroke();
      }
    }

    drawScenery(s) {
      const ctx = this.ctx, a = this.accent, V = CONFIG.view;
      const spacing = 260, maxZ = 2400;
      const base = Math.floor(s.distance / spacing), off = s.distance % spacing;
      for (let i = Math.floor(maxZ / spacing); i >= -1; i--) {
        const z = i * spacing - off;
        const sc = V.perspective / (V.perspective + z);
        const groundY = V.horizonY + (V.groundY - V.horizonY) * sc;
        const idx = base + i;
        for (const lat of [-1.85, 1.85, -2.7, 2.7]) {
          const h = (80 + (((idx + (lat > 0 ? 3 : 0)) * 37) % 5) * 30) * sc;
          const x = this.cx + lat * V.laneWidth * sc;
          ctx.fillStyle = rgba(a, 0.18);
          ctx.fillRect(x - 10 * sc, groundY - h, 20 * sc, h);
          ctx.fillStyle = rgba(a, 0.75);
          ctx.fillRect(x - 10 * sc, groundY - h, 20 * sc, Math.max(1, 4 * sc));
        }
      }
    }

    drawEntities(game) {
      const s = game.session;
      const list = this.list;
      list.length = 0;
      for (const o of game.obstacles.list) list.push(o);
      for (const c of game.collectibles.list) list.push(c);
      if (s.finish) list.push(s.finish);
      list.sort((p, q) => q.z - p.z);                     // far -> near

      let playerDrawn = false;
      for (const item of list) {
        if (!playerDrawn && item.z < 0) { this.drawPlayer(game); playerDrawn = true; }
        if (item.kind === 'obstacle') this.drawObstacle(item, s.time);
        else if (item.kind === 'collectible') this.drawCollectible(item, s.time);
        else this.drawFinish(item);
      }
      if (!playerDrawn) this.drawPlayer(game);
    }

    fade(z) { return clamp((CONFIG.view.spawnDistance - z) / 180, 0, 1); }

    drawObstacle(o, t) {
      const ctx = this.ctx;
      const p = this.project(o.laneX, o.z);
      if (p.s < 0.02) return;
      ctx.save();
      ctx.globalAlpha = this.fade(o.z) * (o.hit ? 0.4 : 1);
      ctx.translate(p.x, p.y);
      ctx.scale(p.s, p.s);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(0, 0, o.width * 0.45, 9, 0, 0, Math.PI * 2); ctx.fill();
      const img = this.assets.getImage(o.type.imageKey);
      if (img) ctx.drawImage(img, -o.width / 2, -o.type.top, o.width, o.type.top - o.type.bottom);
      else o.type.draw(ctx, o, t);
      ctx.restore();
    }

    drawCollectible(c, t) {
      const ctx = this.ctx, cc = CONFIG.collectibles;
      const type = COLLECTIBLE_TYPES[c.typeId];
      const p = this.project(c.laneX, c.z);
      if (p.s < 0.02) return;
      const bob = Math.sin(t * 4 + c.phase) * 6;
      ctx.save();
      ctx.globalAlpha = this.fade(c.z);
      ctx.translate(p.x, p.y);
      ctx.scale(p.s, p.s);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(0, 0, 22, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.translate(0, -(cc.hoverHeight + cc.width / 2 + bob));
      ctx.shadowColor = type.color; ctx.shadowBlur = 16;
      const img = this.assets.getImage(type.imageKey);
      if (img) ctx.drawImage(img, -cc.width / 2, -cc.width / 2, cc.width, cc.width);
      else type.draw(ctx, c, t);
      ctx.restore();
    }

    drawFinish(f) {
      const ctx = this.ctx, a = this.accent;
      const p = this.project(0, f.z);
      if (p.s < 0.03) return;
      const half = 225;
      ctx.save();
      ctx.globalAlpha = this.fade(f.z);
      ctx.translate(p.x, p.y);
      ctx.scale(p.s, p.s);
      const sq = 25;                                      // checkered strip
      for (let i = 0; i < 18; i++) {
        for (let r = 0; r < 2; r++) {
          ctx.fillStyle = (i + r) % 2 === 0 ? '#ffffff' : '#111111';
          ctx.fillRect(-half + i * sq, -20 + r * 10, sq, 10);
        }
      }
      ctx.fillStyle = '#263238';                          // gantry posts + banner
      ctx.fillRect(-half - 14, -240, 14, 240);
      ctx.fillRect(half, -240, 14, 240);
      ctx.fillStyle = '#0b1226';
      ctx.fillRect(-half - 14, -262, half * 2 + 28, 46);
      ctx.strokeStyle = rgba(a, 1); ctx.lineWidth = 3;
      ctx.strokeRect(-half - 14, -262, half * 2 + 28, 46);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.font = `bold 30px ${CONFIG.fontFamily}`;
      ctx.fillText('FINISH', 0, -228);
      ctx.restore();
    }

    drawPlayer(game) {
      const ctx = this.ctx, pl = game.player, s = game.session, V = CONFIG.view;
      const x = this.cx + pl.x * V.laneWidth;
      const lift = pl.height;
      // shadow shrinks as the robot jumps
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.ellipse(x, V.groundY + 2, 34 * (1 - lift / 450), 9, 0, 0, Math.PI * 2); ctx.fill();

      ctx.save();
      if (s.invulnerable > 0 && Math.floor(s.time * 12) % 2 === 0) ctx.globalAlpha = 0.4; // blink
      ctx.translate(x, V.groundY - lift);
      const img = this.assets.getImage('robot');
      if (img) {
        ctx.drawImage(img, -pl.width / 2, -pl.hitHeight, pl.width, pl.hitHeight);
      } else {
        if (pl.isSliding) ctx.scale(1.25, CONFIG.player.slideHeight / CONFIG.player.standHeight);
        this.drawRobot(pl);
      }
      ctx.restore();
    }

    // Robot is exactly 110 px tall (matches the standing hitbox).
    drawRobot(pl) {
      const ctx = this.ctx, a = this.accent;
      const sw = Math.sin(pl.runPhase);
      const air = pl.isJumping;
      const legL = air ? 18 : 24 - Math.max(0, sw) * 10;
      const legR = air ? 24 : 24 - Math.max(0, -sw) * 10;
      const arm = air ? -6 : sw * 6;
      ctx.fillStyle = '#78909c';                          // legs + feet
      ctx.fillRect(-22, -legL, 14, legL);
      ctx.fillRect(8, -legR, 14, legR);
      ctx.fillStyle = '#37474f';
      ctx.fillRect(-25, -4, 20, 4); ctx.fillRect(5, -4, 20, 4);
      ctx.fillStyle = '#b0bec5';                          // arms
      ctx.fillRect(-38, -72 + arm, 9, 30); ctx.fillRect(29, -72 - arm, 9, 30);
      ctx.fillStyle = '#eceff1';                          // body
      roundRectPath(ctx, -27, -76, 54, 50, 10); ctx.fill();
      ctx.fillStyle = rgba(a, 0.9);                       // chest panel
      ctx.shadowColor = rgba(a, 1); ctx.shadowBlur = 10;
      roundRectPath(ctx, -14, -66, 28, 20, 5); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#cfd8dc';                          // head
      roundRectPath(ctx, -22, -100, 44, 24, 8); ctx.fill();
      ctx.fillStyle = '#0b1020';                          // visor
      roundRectPath(ctx, -16, -95, 32, 11, 5); ctx.fill();
      ctx.fillStyle = rgba(a, 1);                         // eyes
      ctx.beginPath(); ctx.arc(-7, -89.5, 3.3, 0, Math.PI * 2); ctx.arc(7, -89.5, 3.3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#90a4ae'; ctx.lineWidth = 2;     // antenna
      ctx.beginPath(); ctx.moveTo(0, -100); ctx.lineTo(0, -106); ctx.stroke();
      ctx.fillStyle = '#ff5252';
      ctx.beginPath(); ctx.arc(0, -107, 3, 0, Math.PI * 2); ctx.fill();
    }

    drawParticles(s) {
      const ctx = this.ctx;
      ctx.save();
      ctx.textAlign = 'center';
      for (const p of s.particles) {
        ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
        if (p.text) {
          ctx.fillStyle = p.color;
          ctx.font = `bold 22px ${CONFIG.fontFamily}`;
          ctx.fillText(p.text, p.x, p.y);
        } else {
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
      }
      ctx.restore();
    }

    drawOverlays(game) {
      const ctx = this.ctx, s = game.session, W = this.W, H = this.H, a = this.accent;
      // red flash when hit
      if (s.hitFlash > 0) {
        ctx.fillStyle = `rgba(255,23,68,${clamp(s.hitFlash, 0, 1) * 0.5})`;
        ctx.fillRect(0, 0, W, H);
      }
      // urgency vignette in the last 20 seconds
      if (game.stages.isLast && s.elapsed > CONFIG.totalDuration - 20) {
        const pulse = 0.5 + 0.5 * Math.sin(s.time * 6);
        const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.75);
        g.addColorStop(0, 'rgba(255,80,0,0)');
        g.addColorStop(1, `rgba(255,80,0,${0.15 + pulse * 0.3})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        if (s.elapsed > CONFIG.totalDuration - 10) {
          ctx.fillStyle = `rgba(255,255,255,${0.5 + pulse * 0.5})`;
          ctx.font = `bold 20px ${CONFIG.fontFamily}`;
          ctx.textAlign = 'center';
          ctx.fillText('DEPLOYMENT IN PROGRESS', W / 2, 930 - 28);
        }
      }
      // run progress bar (bottom): how close the finish line is
      const ratio = clamp(s.elapsed / CONFIG.totalDuration, 0, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(40, H - 24, W - 80, 8);
      ctx.fillStyle = rgba(a, 1);
      ctx.fillRect(40, H - 24, (W - 80) * ratio, 8);
      ctx.fillStyle = '#fff';
      ctx.fillRect(40 + (W - 80) * ratio - 3, H - 29, 6, 18);
      // stage banner
      if (game.states.is(STATE.STAGE_TRANSITION) && s.banner) {
        const t = clamp(s.transitionTimer / CONFIG.stageTransitionSeconds, 0, 1);
        const alpha = Math.min(1, t * 4, (1 - t) * 8 + 0.0001);
        ctx.save();
        ctx.globalAlpha = clamp(alpha, 0, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, H * 0.3 - 60, W, 120);
        ctx.textAlign = 'center';
        ctx.fillStyle = rgba(a, 1);
        ctx.font = `bold 30px ${CONFIG.fontFamily}`;
        ctx.fillText(s.banner.title, W / 2, H * 0.3 - 6);
        ctx.fillStyle = '#fff';
        ctx.font = `20px ${CONFIG.fontFamily}`;
        ctx.fillText(s.banner.subtitle, W / 2, H * 0.3 + 30);
        ctx.restore();
      }
    }
  }

  /* ===================================================================
     17. GAME  (single requestAnimationFrame loop + orchestration)
     =================================================================== */
  function createSession() {
    return {
      elapsed: 0,          // gameplay seconds (frozen during quiz/pause)
      time: 0,             // animation clock
      distance: 0,
      speed: CONFIG.speed.perStage[0],
      lives: CONFIG.lives,
      collisions: 0,
      invulnerable: 0,
      hitFlash: 0,
      shake: 0,
      transitionTimer: 0,
      banner: null,
      gateIndex: 0,
      speedBoost: 0,       // accumulated speed from answered questions
      finish: null,        // finish-line entity once spawned
      particles: [],
    };
  }

  class Game {
    constructor(els) {
      this.els = els;
      this.assets = new Assets(CONFIG.assets);
      this.sound = new SoundManager(CONFIG.assets);
      this.ui = new UI(els);
      this.states = new GameStateManager((prev, next) => this.onStateChange(prev, next));
      this.player = new Player(CONFIG.player, {
        onJump: () => this.sound.play('jump'),
        onSlide: () => this.sound.play('slide'),
      });
      this.obstacles = new ObstacleManager(CONFIG.obstacles);
      this.collectibles = new CollectibleManager(CONFIG.collectibles);
      this.stages = new StageManager();
      this.progress = new AIProgressManager();
      this.quiz = new QuizManager(QUIZ_QUESTIONS, els, this.sound);
      this.quiz.onAnswered = () => this.applyQuestionBoost();
      this.scoreMgr = new ScoreManager(CONFIG.scoring);
      this.renderer = new Renderer(els.canvas, this.assets);
      this.session = createSession();
      this.pausedFrom = null;
      this.rafId = 0;
      this.lastTs = 0;
      this.tick = this.tick.bind(this);
      this.input = new InputController(els, this);
      this.onVisibility = () => { if (document.hidden) this.pause(); };
      this.onPageHide = () => this.destroy();
    }

    init() {
      if (platformComplete) return;
      this.bindButtons();
      this.input.attach();
      document.addEventListener('visibilitychange', this.onVisibility);
      window.addEventListener('pagehide', this.onPageHide);
      this.resetSession();
      this.ui.applyState(STATE.START);
      this.renderer.draw(this, 0);                       // idle frame
    }

    bindButtons() {
      const e = this.els;
      const on = (el, fn) => { if (el) el.addEventListener('click', fn); };
      on(e.startBtn, () => this.start());
      on(e.restartBtn, () => this.start());
      on(e.pauseHomeBtn, () => this.goHome());
      on(e.endHomeBtn, () => this.goHome());
      on(e.pauseBtn, () => this.pause());
      on(e.resumeBtn, () => this.resume());
      on(e.continueBtn, () => this.quiz.close());
      on(e.fullscreenBtn, () => this.toggleFullscreen());
      const d = document;
      const fsOk = d.documentElement.requestFullscreen || d.documentElement.webkitRequestFullscreen;
      if (!fsOk) setHidden(e.fullscreenBtn, true);       // e.g. iPhone Safari
    }

    toggleFullscreen() {
      const d = document, el = d.documentElement;
      try {
        if (d.fullscreenElement || d.webkitFullscreenElement) {
          (d.exitFullscreen || d.webkitExitFullscreen).call(d);
        } else {
          const req = el.requestFullscreen || el.webkitRequestFullscreen;
          if (req) { const r = req.call(el); if (r && r.catch) r.catch(() => { }); }
        }
      } catch (err) { /* fullscreen not allowed */ }
    }

    destroy() {
      this.stopLoop();
      this.input.detach();
      document.removeEventListener('visibilitychange', this.onVisibility);
      window.removeEventListener('pagehide', this.onPageHide);
    }

    /* ---------- state helpers ---------- */
    canControl() { return this.states.is(STATE.PLAYING, STATE.STAGE_TRANSITION); }

    onStateChange(prev, next) {
      if (platformComplete && next !== platformEndState) { this.states.current = platformEndState; return; }
      this.ui.applyState(next);
      const was = RUNNING_STATES.has(prev), now = RUNNING_STATES.has(next);
      if (now && !was) this.startLoop();
      if (!now && was) { this.stopLoop(); }
      if (!now) this.renderer.draw(this, 0);             // show the frozen frame
    }

    start() {
      if (platformComplete) return;
      this.sound.unlock();
      this.sound.preload();
      this.stopLoop();
      this.resetSession();
      this.states.set(STATE.PLAYING);
      if (this.states.current === STATE.PLAYING && !this.rafId) this.startLoop();
      this.blurActive();
    }

    // Stops the game and returns to the start screen.
    goHome() {
      if (platformComplete) return;
      this.stopLoop();
      this.resetSession();
      this.states.set(STATE.START);
    }

    // Resets everything: score, progress, lives, collectibles, timers.
    resetSession() {
      if (platformComplete) return;
      this.session = createSession();
      this.player.reset();
      this.obstacles.reset();
      this.collectibles.reset();
      this.stages.reset();
      this.progress.reset();
      this.quiz.reset();
      this.pausedFrom = null;
      this.ui.clearHit();
      this.ui.updateProgress(this.progress);
      this.updateHud();
    }

    blurActive() {
      const a = document.activeElement;
      if (a && a !== document.body && a.blur) a.blur();
    }

    pause() {
      if (!this.states.is(STATE.PLAYING, STATE.STAGE_TRANSITION)) return;
      this.pausedFrom = this.states.current;
      this.states.set(STATE.PAUSED);
    }
    resume() {
      if (platformComplete) return;
      if (!this.states.is(STATE.PAUSED)) return;
      this.states.set(this.pausedFrom || STATE.PLAYING);
      this.blurActive();
    }
    togglePause() {
      if (this.states.is(STATE.PAUSED)) this.resume(); else this.pause();
    }

    /* ---------- loop (exactly one requestAnimationFrame at a time) ---------- */
    startLoop() {
      if (platformComplete) return;
      if (this.rafId) return;
      this.lastTs = 0;
      this.rafId = requestAnimationFrame(this.tick);
    }
    stopLoop() {
      if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = 0; }
    }
    tick(ts) {
      this.rafId = 0;
      if (!this.states.is(STATE.PLAYING, STATE.STAGE_TRANSITION)) return;
      if (!this.lastTs) this.lastTs = ts;
      const dt = clamp((ts - this.lastTs) / 1000, 0, 0.05);   // delta time, capped
      this.lastTs = ts;
      this.update(dt);
      if (this.states.is(STATE.PLAYING, STATE.STAGE_TRANSITION)) {
        this.renderer.draw(this, dt);
        if (!this.rafId) this.rafId = requestAnimationFrame(this.tick);
      }
    }

    /* ---------- update ---------- */
    update(dt) {
      const s = this.session;
      // If a quiz gate falls inside this frame, stop exactly on it.
      const gate = CONFIG.quiz.gates[s.gateIndex];
      let step = dt, reachedGate = false;
      if (gate && s.elapsed + dt >= gate.time) {
        step = Math.max(0, gate.time - s.elapsed);
        reachedGate = true;
      }
      s.elapsed += step;
      s.time += dt;

      this.advanceWorld(step);
      if (!this.states.is(STATE.PLAYING, STATE.STAGE_TRANSITION)) return;  // game ended
      this.updateEffects(dt);
      this.updateHud();
      if (reachedGate) this.openGate(gate);
    }

    advanceWorld(step) {
      const s = this.session;

      // smooth speed changes
      const target = this.stages.targetSpeed(s.elapsed, s.speedBoost);
      const maxDelta = CONFIG.speed.acceleration * step;
      s.speed += clamp(target - s.speed, -maxDelta, maxDelta);
      s.distance += s.speed * step;

      // stage-transition banner phase (world keeps moving, nothing new spawns)
      if (this.states.is(STATE.STAGE_TRANSITION)) {
        s.transitionTimer -= step;
        if (s.transitionTimer <= 0) this.states.set(STATE.PLAYING);
      }
      const spawning = this.states.is(STATE.PLAYING) && !s.finish;

      this.player.update(step);
      this.obstacles.update(step, s.speed, {
        spawn: spawning,
        stageIndex: this.stages.index,
        elapsed: s.elapsed,
        collectibles: this.collectibles.list,
      });
      this.collectibles.update(step, s.speed, {
        spawn: spawning,
        stageIndex: this.stages.index,
        stageElapsed: this.stages.stageElapsed(s.elapsed),
        obstacles: this.obstacles.list,
      });

      // finish line appears so that it is reached at about totalDuration
      const allGatesDone = s.gateIndex >= CONFIG.quiz.gates.length;
      if (!s.finish && allGatesDone &&
        s.elapsed >= CONFIG.totalDuration - CONFIG.view.spawnDistance / s.speed) {
        s.finish = { kind: 'finish', z: CONFIG.view.spawnDistance, prevZ: CONFIG.view.spawnDistance };
      }
      if (s.finish) {
        s.finish.prevZ = s.finish.z;
        s.finish.z -= s.speed * step;
      }

      // collectibles first, then obstacles
      for (const c of this.collectibles.collectTouching(this.player)) this.onCollect(c);
      if (s.invulnerable <= 0) this.checkObstacleHits();
      if (!this.states.is(STATE.PLAYING, STATE.STAGE_TRANSITION)) return;   // lost last life

      // reaching the finish line
      if (s.finish && s.finish.z <= 0) this.endGame(true);
    }

    checkObstacleHits() {
      for (const o of this.obstacles.list) {
        if (o.hit) continue;
        if (Collision.hitsObstacle(this.player, o)) { this.registerHit(o); break; }
      }
    }

    registerHit(o) {
      const s = this.session;
      o.hit = true;                         // this obstacle can never hit again
      s.lives = Math.max(0, s.lives - 1);
      s.collisions++;                       // cancels the no-collision bonus
      s.invulnerable = CONFIG.invulnerabilitySeconds;
      s.hitFlash = 0.45;
      s.shake = 0.35;
      this.sound.play('hit');
      this.ui.flashHit();
      this.burst(this.renderer.cx + this.player.x * CONFIG.view.laneWidth,
        CONFIG.view.groundY - 50, '#ff5252', 14);
      if (s.lives <= 0) this.endGame(false);
    }

    onCollect(c) {
      if (!this.progress.collect(c.stageIndex)) return;
      this.ui.updateProgress(this.progress);              // real-time progress bars
      this.sound.play('collect');
      const type = COLLECTIBLE_TYPES[c.typeId];
      const x = this.renderer.cx + this.player.x * CONFIG.view.laneWidth;
      const y = CONFIG.view.groundY - 90 - this.player.height;
      this.burst(x, y, type.color, 12);
      this.floatText(x, y - 20, `+1 ${type.label}`, type.color);
    }

    openGate(gate) {
      const s = this.session;
      const idx = s.gateIndex;
      s.gateIndex++;
      this.sound.play('stage');
      this.states.set(STATE.QUIZ);
      this.quiz.open(idx, () => this.afterGate(gate));
    }

    // Every answered question (right or wrong) makes the robot a bit faster.
    // Called once per question (the quiz locks a question after its first answer).
    // The extra speed is added to the normal target speed, so the existing
    // stage-based progression keeps working and the world accelerates smoothly.
    applyQuestionBoost() {
      const s = this.session, sp = CONFIG.speed;
      const maxBoost = sp.questionBoost * CONFIG.quiz.gates.length;
      s.speedBoost = Math.min(maxBoost, s.speedBoost + sp.questionBoost);
    }

    afterGate(gate) {
      if (!this.states.is(STATE.QUIZ)) return;
      const s = this.session;
      s.invulnerable = Math.max(s.invulnerable, CONFIG.postQuizGraceSeconds);
      if (!gate.advanceStage && !gate.finalSprint) {
        // Question in the middle of a stage: no banner, just resume the run.
        this.updateHud();
        this.states.set(STATE.PLAYING);
        this.blurActive();
        return;
      }
      if (gate.advanceStage) {
        this.stages.advance();                            // progress of finished stages is kept
        s.banner = { title: this.stages.current.name, subtitle: this.stages.current.tagline };
      } else {
        s.banner = { title: 'الانطلاقة الأخيرة', subtitle: 'وصّل لخط النهاية وأطلق النموذج!' };
      }
      s.transitionTimer = CONFIG.stageTransitionSeconds;
      this.updateHud();
      this.states.set(STATE.STAGE_TRANSITION);
      this.blurActive();
    }

    /* ---------- effects ---------- */
    burst(x, y, color, n) {
      const ps = this.session.particles;
      for (let i = 0; i < n && ps.length < 90; i++) {
        const a = Math.random() * Math.PI * 2, sp = rand(60, 220);
        ps.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5, max: 0.5, color, size: rand(4, 8), text: null });
      }
    }
    floatText(x, y, text, color) {
      const ps = this.session.particles;
      if (ps.length < 90) ps.push({ x, y, vx: 0, vy: -70, life: 0.9, max: 0.9, color, size: 0, text });
    }
    updateEffects(dt) {
      const s = this.session;
      s.invulnerable = Math.max(0, s.invulnerable - dt);
      s.hitFlash = Math.max(0, s.hitFlash - dt);
      s.shake = Math.max(0, s.shake - dt);
      for (let i = s.particles.length - 1; i >= 0; i--) {
        const p = s.particles[i];
        p.life -= dt;
        if (p.life <= 0) { s.particles.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (!p.text) p.vy += 300 * dt;
      }
    }

    /* ---------- scoring / HUD / end ---------- */
    scoreStats(finished) {
      return {
        collected: this.progress.totalCollected,
        correct: this.quiz.correctCount,
        collisions: this.session.collisions,
        finished,
      };
    }

    updateHud() {
      const s = this.session;
      this.ui.updateHud({
        score: this.scoreMgr.compute(this.scoreStats(false)).total,
        remaining: CONFIG.totalDuration - s.elapsed,
        lives: s.lives,
        stageName: this.stages.index + 1,
      });
    }

    endGame(victory) {
      if (platformComplete) return;
      const s = this.session;
      const breakdown = this.scoreMgr.compute(this.scoreStats(victory));
      const pct = [0, 1, 2].map((i) => Math.round(this.progress.percent(i)));
      const status = `البيانات ${pct[0]}% · التدريب ${pct[1]}% · الإطلاق ${pct[2]}%`;
      const complete = this.progress.isComplete && (victory || !CONFIG.requireFinishForSuccess);

      let message;
      if (complete) message = 'تم إطلاق النموذج بنجاح! 🚀';
      else if (victory) message = 'وصلت لخط النهاية، لكن النموذج ناقص';
      else message = 'نفدت بطاريات الروبوت قبل الإطلاق';

            // Final score for the hub platform
      window.finalScore = breakdown.total;
      if (platformPort) {
        platformEndState = victory ? STATE.VICTORY : STATE.GAME_OVER;
        platformComplete = true;
      }
      try { window.parent.postMessage(platformPort ? {
        type: 'DEV_RUN_FINAL_SCORE', version: 1, game: 'dev-run', nonce: platformNonce,
        score: breakdown.total, maxScore: 100, breakdown,
        stats: { collected: this.progress.totalCollected, correct: this.quiz.correctCount, collisions: s.collisions, finished: victory },
      } : { type: 'DEV_RUN_FINAL_SCORE', score: breakdown.total }, '*'); } catch (e) { /* ignore */ }
      this.sound.play(victory ? 'victory' : 'gameover');
      this.states.set(victory ? STATE.VICTORY : STATE.GAME_OVER);   // stops the loop
      this.ui.showResults({
        victory,
        message,
        breakdown,
        collected: this.progress.totalCollected,
        correct: this.quiz.correctCount,
        collisions: s.collisions,
      });
      if (platformPort) lockPlatformRound(this);
    }
  }

  /* ===================================================================
     18. BOOTSTRAP
     =================================================================== */
  function boot() {
    const els = bindElements();
    if (!els.canvas || !els.canvas.getContext) {
      console.error('[Dev Run] <canvas id="game-canvas"> is required.');
      return;
    }
    // Developer sanity check: every quiz gate needs exactly one 4-answer question of its own stage.
    CONFIG.quiz.gates.forEach((g, i) => {
      const q = QUIZ_QUESTIONS[i];
      if (!q || q.options.length < 2 || q.stage !== g.stage || q.correctIndex >= q.options.length) {
        console.warn(`[Dev Run] Quiz gate ${i + 1} does not match its question.`);
      }
    });
    const game = new Game(els);
    game.init();
    bindPlatform(game);
    window.__devRun = game;   // handy for debugging in the console
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
