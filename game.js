// ============================================================
// Mineblown — Phase 1 MVP (Local 2-Player Prototype)
// ============================================================

let canvas, ctx;

// --- Audio ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let sfxMuted = false;
let musicMuted = false;

// --- Intro / Menu Music ---
const introMusic = new Audio('music/intro.mp3');
introMusic.loop = false;
introMusic.volume = 0.4;

// Autoplay on load; fall back to first user gesture if browser blocks it
introMusic.play().catch(() => {
  const onGesture = () => {
    if (!gameStarted) introMusic.play().catch(() => {});
    document.removeEventListener('click', onGesture);
    document.removeEventListener('keydown', onGesture);
    document.removeEventListener('touchstart', onGesture);
  };
  document.addEventListener('click', onGesture);
  document.addEventListener('keydown', onGesture);
  document.addEventListener('touchstart', onGesture);
});

// --- Background Music ---
const bgMusic = new Audio('music/bg-music.mp3');
bgMusic.loop = true;
bgMusic.volume = 0.4;

// --- Victory / Defeat Music ---
const victoryMusic = new Audio('music/victory_music.mp3');
victoryMusic.loop = false;
victoryMusic.volume = 0.4;
const defeatMusic = new Audio('music/defeat_music.mp3');
defeatMusic.loop = false;
defeatMusic.volume = 0.4;

// --- Power-Up Sound ---
const powerUpSound = new Audio('music/powerup.wav');
powerUpSound.volume = 0.5;

function toggleMusic() {
  musicMuted = !musicMuted;
  if (musicMuted) {
    bgMusic.pause();
  } else {
    if (gameStarted) bgMusic.play().catch(() => {});
  }
  // Sync all music toggle buttons
  document.querySelectorAll('#music-toggle, #music-toggle-game').forEach(btn => {
    btn.classList.toggle('muted', musicMuted);
    btn.classList.toggle('active', !musicMuted);
  });
}

function toggleSfx() {
  sfxMuted = !sfxMuted;
  // Sync all sfx toggle buttons
  document.querySelectorAll('#sfx-toggle, #sfx-toggle-game').forEach(btn => {
    btn.classList.toggle('muted', sfxMuted);
    btn.classList.toggle('active', !sfxMuted);
  });
}

// ============================================================
// Menu Navigation
// ============================================================

function showMenu(screen) {
  document.querySelectorAll('#menu-screen .menu-panel').forEach(p => p.style.display = 'none');
  if (screen === 'main') {
    document.getElementById('menu-main').style.display = 'flex';
  } else if (screen === 'controls') {
    document.getElementById('menu-controls').style.display = 'flex';
  } else if (screen === 'about') {
    document.getElementById('menu-about').style.display = 'flex';
  } else if (screen === 'single-player') {
    document.getElementById('menu-single-player').style.display = 'flex';
  } else if (screen === 'online') {
    document.getElementById('menu-online').style.display = 'flex';
  }
}

document.addEventListener('click', (e) => {
  if (e.target.closest('.menu-btn')) playSound('menuClick');
});

let gameLoopRunning = false;

function startGame() {
  document.getElementById('menu-screen').style.display = 'none';
  document.getElementById('game-ui').style.display = 'flex';

  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');
  canvas.width = COLS * TILE_SIZE;
  canvas.height = ROWS * TILE_SIZE;
  scaleCanvas();

  if (audioCtx.state === 'suspended') audioCtx.resume();
  introMusic.pause();
  introMusic.currentTime = 0;
  if (!musicMuted) bgMusic.play().catch(() => {});

  resetPlayers();
  gameStarted = true;
  gameOver = false;
  winner = null;
  gameStartTime = performance.now();
  gameFinishTime = 0;
  resolvedSafeTileCount = 0;
  rumbleUntil = new Float64Array(ROWS * COLS);
  lastPowerUpSpawn = performance.now();
  generateBoard();
  updateStatusText();

  // Update labels for single-player mode
  const p1Label = document.querySelector('#p1-info .player-label');
  if (p1Label) p1Label.textContent = singlePlayer ? 'AI' : 'Player 1';
  const p2Label = document.querySelector('#p2-info .player-label');
  if (p2Label) p2Label.textContent = singlePlayer ? 'You' : 'Player 2';

  const bottomBar = document.getElementById('bottom-bar');
  if (bottomBar) {
    if (isMobile) {
      bottomBar.innerHTML = '';
    } else if (singlePlayer || onlineMode) {
      bottomBar.innerHTML = '<div class="controls-hint"><strong>You:</strong> Arrows move · / reveal · . flag · 9 random atk · 0 precision atk</div>';
    } else {
      bottomBar.innerHTML = '<div class="controls-hint"><strong>P1:</strong> WASD move · E reveal · Q flag · 1 random atk · 2 precision atk</div><div class="controls-hint"><strong>P2:</strong> Arrows move · / reveal · . flag · 9 random atk · 0 precision atk</div>';
    }
  }

  if (isMobile) {
    setupTouchControls();
    document.getElementById('touch-controls').style.display = 'flex';
    document.getElementById('touch-p1').style.display = (singlePlayer || onlineMode) ? 'none' : 'flex';
    const p2Panel = document.getElementById('touch-p2');
    const p2Label = document.querySelector('#touch-p2 .touch-panel-label');
    if (onlineMode) {
      p2Label.textContent = `P${localPlayerNum}`;
      p2Panel.classList.toggle('online-as-p1', localPlayerNum === 1);
    } else {
      p2Label.textContent = 'P2';
      p2Panel.classList.remove('online-as-p1');
    }
  }

  if (!gameLoopRunning) {
    gameLoopRunning = true;
    gameLoop();
  }
}

function startSinglePlayer(difficulty) {
  singlePlayer = true;
  aiDifficulty = difficulty || 'easy';
  aiPreset = AI_PRESETS[aiDifficulty];
  aiTarget = null;
  aiAction = null;
  aiHesitation = 0;
  aiMineMemory = [];
  aiSafeMemory = [];
  aiLastAnalysis = 0;
  aiLastTick = 0;
  startGame();
}

function returnToMenu() {
  if (socket) { socket.onclose = null; socket.close(); socket = null; }
  onlineMode = false;
  localPlayerNum = 0;
  opponentLeft = false;
  gameStarted = false;
  gameOver = false;
  winner = null;
  singlePlayer = false;
  bgMusic.pause();
  bgMusic.currentTime = 0;
  victoryMusic.pause();
  victoryMusic.currentTime = 0;
  defeatMusic.pause();
  defeatMusic.currentTime = 0;

  clearTouchMovementKeys();
  const touchEl = document.getElementById('touch-controls');
  if (touchEl) touchEl.style.display = 'none';

  document.getElementById('game-ui').style.display = 'none';
  document.getElementById('menu-screen').style.display = 'flex';
  showMenu('main');
}


function playSound(type) {
  if (sfxMuted) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const now = audioCtx.currentTime;
  const gain = audioCtx.createGain();
  gain.connect(audioCtx.destination);

  if (type === 'reveal') {
    // Short click
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.06);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.08);

  } else if (type === 'claim') {
    // Chime
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.15);

  } else if (type === 'flag') {
    // Marker click
    const osc = audioCtx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1000, now);
    osc.frequency.exponentialRampToValueAtTime(1400, now + 0.05);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.1);

  } else if (type === 'flagFail') {
    // Buzzer
    const osc = audioCtx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.25);

  } else if (type === 'explosion') {
    // Muffled boom — low oscillator dropping in pitch
    const osc = audioCtx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.35);
    // Sub-bass layer
    const osc2 = audioCtx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(80, now);
    osc2.frequency.exponentialRampToValueAtTime(20, now + 0.4);
    const gain2 = audioCtx.createGain();
    gain2.gain.setValueAtTime(0.25, now);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.connect(gain);
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.35);
    osc2.start(now);
    osc2.stop(now + 0.4);

  } else if (type === 'stun') {
    // Electric zap
    const osc = audioCtx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.2);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.25);

  } else if (type === 'teleport') {
    // Warpy sweep
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(1500, now + 0.15);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.3);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.3);

  } else if (type === 'attackRandom') {
    // Whoosh + impact
    const osc = audioCtx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.2);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.25);

  } else if (type === 'attackPrecision') {
    // Sharp zap + thud
    const osc = audioCtx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.15);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.3);
    // Thud layer
    const osc2 = audioCtx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(60, now + 0.1);
    const gain2 = audioCtx.createGain();
    gain2.gain.setValueAtTime(0.2, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.35);

  } else if (type === 'powerUpPickup') {
    // Play WAV file
    powerUpSound.currentTime = 0;
    powerUpSound.play().catch(() => {});
    return; // skip gain node cleanup

  } else if (type === 'powerUpActivate') {
    // Activation whoosh
    const osc = audioCtx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.12);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.18);

  } else if (type === 'gameOver') {
    // Descending fanfare
    [523, 440, 349, 262].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.2);
      g.gain.setValueAtTime(0.15, now + i * 0.2);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.2 + 0.3);
      osc.connect(g);
      g.connect(audioCtx.destination);
      osc.start(now + i * 0.2);
      osc.stop(now + i * 0.2 + 0.3);
    });

  } else if (type === 'menuClick') {
    // Soft click
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(700, now + 0.04);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.06);
  }
}

// --- Configuration ---
const COLS = 24;
const ROWS = 24;
const MINE_DENSITY = 0.15; // 15% of tiles are mines
const TILE_SIZE = 28;

// --- Seeded PRNG (Mulberry32) ---
function makePRNG(seed) {
  return function () {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
let seededRand = Math.random;
const MOVE_COOLDOWN = 150; // ms between moves
const ATTACK_COOLDOWN = 2000; // ms between attacks
const RANDOM_ATTACK_RADIUS = 2; // tiles from center
const PRECISION_ATTACK_RADIUS = 1; // tiles from center
const RANDOM_ATTACK_STUN = 750; // ms
const PRECISION_ATTACK_STUN = 2000; // ms

// --- Power-Up Types ---
const POWERUP_SHIELD = 'shield';
const POWERUP_FIREWALL = 'firewall';
const POWERUP_REINFORCE = 'reinforce';
const POWERUP_DRAIN = 'drain';
const POWERUP_TYPES = [POWERUP_SHIELD, POWERUP_FIREWALL, POWERUP_REINFORCE, POWERUP_DRAIN];

// --- Power-Up Configuration ---
const POWERUP_SPAWN_INTERVAL = 15000; // ms between spawn attempts
const POWERUP_MAX_ON_BOARD = 3;
const FIREWALL_DURATION = 30000; // ms
const REINFORCE_RADIUS = 2; // tiles from center
const DRAIN_RADIUS = 3; // tiles from center

// --- Colors ---
const COLORS = {
  unrevealed: '#2a2a4a',
  unrevealedBorder: '#3a3a5a',
  revealed: '#d0d0d0',
  revealedBorder: '#b0b0b0',
  mine: '#ff4444',
  flagP1: '#4fc3f7',
  flagP2: '#ef5350',
  p1Claim: '#1a6b8a',
  p1ClaimBorder: '#2488aa',
  p2Claim: '#8a1a1a',
  p2ClaimBorder: '#aa2424',
  p1Player: '#4fc3f7',
  p2Player: '#ef5350',
  scorched: '#3a3a3a',
  scorchedBorder: '#4a4a4a',
  numberColors: [
    null,       // 0 - unused
    '#1976d2',  // 1 - blue
    '#388e3c',  // 2 - green
    '#d32f2f',  // 3 - red
    '#7b1fa2',  // 4 - purple
    '#ff8f00',  // 5 - orange
    '#00838f',  // 6 - teal
    '#424242',  // 7 - dark gray
    '#bdbdbd',  // 8 - light gray
  ]
};

// --- Tile States ---
const TILE_HIDDEN = 0;
const TILE_REVEALED = 1;
const TILE_FLAGGED = 2;
const TILE_SCORCHED = 3;

// --- Board ---
let board = [];    // 2D: { mine, adjacency, state, owner, flaggedBy, scorchedFor }
let totalSafeTiles = 0;


// --- Players ---
const SPAWNS = [{ x: 0, y: 0 }, { x: COLS - 1, y: ROWS - 1 }];
const players = [
  { x: SPAWNS[0].x, y: SPAWNS[0].y, renderX: SPAWNS[0].x, renderY: SPAWNS[0].y, score: 0, stunUntil: 0, lastMove: 0, lastAttack: 0, mines: 0, id: 1, pendingPowerUps: [], hasShield: false, firewallUntil: 0 },
  { x: SPAWNS[1].x, y: SPAWNS[1].y, renderX: SPAWNS[1].x, renderY: SPAWNS[1].y, score: 0, stunUntil: 0, lastMove: 0, lastAttack: 0, mines: 0, id: 2, pendingPowerUps: [], hasShield: false, firewallUntil: 0 },
];

// --- Game State ---
let gameStarted = false;
let gameOver = false;
let winner = null;
let gameStartTime = 0;
let resolvedSafeTileCount = 0;
let gameFinishTime = 0;

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// --- Power-Up State ---
let lastPowerUpSpawn = 0;

// --- Single Player / AI State ---
let singlePlayer = false;
let aiDifficulty = 'easy';

// --- Online State ---
let onlineMode = false;
let socket = null;
let localPlayerNum = 0;   // 1 or 2 when in online mode
let opponentLeft = false;
const WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;

const AI_PRESETS = {
  practice: { tick: 450, analysis: 4000, mistake: 0.40, flagChance: 0.40, hesitateChance: 0.45, hesitateDur: [300, 600], atkSkip: 0.90, atkMinTiles: 20, precisionDist: 3, precisionTiles: 30, precisionMines: 4, randomTiles: 25, randomMines: 5, stockpileMines: 6 },
  easy:   { tick: 300, analysis: 2500, mistake: 0.20, flagChance: 0.65, hesitateChance: 0.30, hesitateDur: [200, 400], atkSkip: 0.65, atkMinTiles: 12, precisionDist: 5, precisionTiles: 20, precisionMines: 2, randomTiles: 15, randomMines: 3, stockpileMines: 4 },
  medium: { tick: 220, analysis: 1500, mistake: 0.10, flagChance: 0.80, hesitateChance: 0.18, hesitateDur: [100, 250], atkSkip: 0.45, atkMinTiles: 8,  precisionDist: 6, precisionTiles: 15, precisionMines: 1, randomTiles: 10, randomMines: 2, stockpileMines: 3 },
  hard:   { tick: 160, analysis: 800,  mistake: 0.04, flagChance: 0.95, hesitateChance: 0.08, hesitateDur: [50, 100],  atkSkip: 0.25, atkMinTiles: 5,  precisionDist: 8, precisionTiles: 10, precisionMines: 1, randomTiles: 8,  randomMines: 1, stockpileMines: 2 },
};

let aiPreset = AI_PRESETS.easy;
let aiLastTick = 0;
let aiTarget = null;                // { x, y }
let aiAction = null;                // 'reveal' | 'flag'
let aiHesitation = 0;               // extra delay ms
let aiMineMemory = [];              // deduced mine positions
let aiSafeMemory = [];              // deduced safe positions
let aiLastAnalysis = 0;

// --- Rumble Effects ---
let rumbleUntil = null; // Float64Array(ROWS * COLS) — until timestamps, 0 = inactive
const RUMBLE_DURATION = 1000; // ms
const RUMBLE_INTENSITY = 3; // pixels

function addRumble(x, y) {
  rumbleUntil[y * COLS + x] = performance.now() + RUMBLE_DURATION;
}

// --- Explosion Particles ---
let particles = [];

const PALETTE_EXPLOSION = ['#ff6600', '#ffcc00', '#ff3300', '#ffffff'];
const PALETTE_ATTACK    = ['#ffffff', '#ffff44', '#ffdd00'];

function spawnParticles(x, y, palette) {
  const cx = (x + 0.5) * TILE_SIZE;
  const cy = (y + 0.5) * TILE_SIZE;
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2 + Math.random() * 0.5;
    const speed = 4 + Math.random() * 7;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1.0,
      decay: 0.028 + Math.random() * 0.016,
      size: 3 + Math.random() * 4,
      color: palette[Math.floor(Math.random() * palette.length)],
    });
  }
}

function updateParticles() {
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.08; // gravity
    p.life -= p.decay;
  }
  particles = particles.filter(p => p.life > 0);
}

function drawParticles() {
  if (particles.length === 0) return;
  // Group by color — one fillStyle set + one fill() call per color instead of per particle
  const byColor = {};
  for (const p of particles) {
    if (!byColor[p.color]) byColor[p.color] = [];
    byColor[p.color].push(p);
  }
  for (const color in byColor) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const p of byColor[color]) {
      const r = p.size * p.life;
      ctx.moveTo(p.x + r, p.y); // moveTo prevents connecting lines between arcs
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}

// --- Input Tracking ---
const keysDown = {};

// --- Touch Controls ---
const isMobile = navigator.maxTouchPoints > 0 && window.matchMedia('(pointer: coarse)').matches;
let touchControlsInitialized = false;
const activeTouches = new Map(); // touchId → { type:'move'|'action', key|btn }

const TOUCH_MOVEMENT_KEYS = {
  '1-up': 'w', '1-down': 's', '1-left': 'a', '1-right': 'd',
  '2-up': 'ArrowUp', '2-down': 'ArrowDown', '2-left': 'ArrowLeft', '2-right': 'ArrowRight',
};

function setupTouchControls() {
  if (touchControlsInitialized) return;
  touchControlsInitialized = true;
  document.body.classList.add('touch-device');
  const container = document.getElementById('touch-controls');
  container.addEventListener('touchstart',  onTouchStart, { passive: false });
  container.addEventListener('touchend',    onTouchEnd,   { passive: false });
  container.addEventListener('touchcancel', onTouchEnd,   { passive: false });
}

function onTouchStart(e) {
  e.preventDefault();
  for (const touch of e.changedTouches) {
    const btn = touch.target.closest('[data-action]');
    if (!btn) continue;
    const playerIndex = parseInt(btn.dataset.player, 10) - 1;
    const action = btn.dataset.action;
    const player = onlineMode ? players[localPlayerNum - 1] : players[playerIndex];
    const moveKey = TOUCH_MOVEMENT_KEYS[`${btn.dataset.player}-${action}`];
    if (moveKey) {
      keysDown[moveKey] = true;
      activeTouches.set(touch.identifier, { type: 'move', key: moveKey, btn });
      btn.classList.add('pressed');
    } else {
      activeTouches.set(touch.identifier, { type: 'action', btn });
      btn.classList.add('pressed');
      if (!gameStarted || gameOver) continue;
      switch (action) {
        case 'reveal':
          revealTile(player.x, player.y, player);
          if (onlineMode) sendGameEvent({ type: 'reveal', x: player.x, y: player.y });
          break;
        case 'flag':
          flagTile(player.x, player.y, player);
          if (onlineMode) sendGameEvent({ type: 'flag', x: player.x, y: player.y });
          break;
        case 'rndatk':
          randomMineAttack(player); // rndatk event sent inside function
          break;
        case 'precatk':
          precisionMineAttack(player);
          if (onlineMode) sendGameEvent({ type: 'precatk' });
          break;
      }
    }
  }
}

function onTouchEnd(e) {
  e.preventDefault();
  for (const touch of e.changedTouches) {
    const record = activeTouches.get(touch.identifier);
    if (!record) continue;
    if (record.type === 'move') keysDown[record.key] = false;
    record.btn.classList.remove('pressed');
    activeTouches.delete(touch.identifier);
  }
}

function clearTouchMovementKeys() {
  for (const [, record] of activeTouches) {
    if (record.type === 'move') keysDown[record.key] = false;
  }
  activeTouches.clear();
  document.querySelectorAll('#touch-controls .touch-btn').forEach(b => b.classList.remove('pressed'));
}

// ============================================================
// Board Generation
// ============================================================

function generateBoard() {
  board = [];

  // Create empty grid
  for (let y = 0; y < ROWS; y++) {
    board[y] = [];
    for (let x = 0; x < COLS; x++) {
      board[y][x] = {
        mine: false,
        adjacency: 0,
        state: TILE_HIDDEN,
        owner: 0,       // 0=none, 1=P1, 2=P2
        flaggedBy: 0,
        scorchedFor: 0, // 0=none, 1=scorched for P1, 2=scorched for P2
        powerUp: null,  // null or POWERUP_* type string
        powerUpFound: null,
        powerUpFoundUntil: 0,
        reinforced: false,
        revealAnimStart: 0,
        attackFlashUntil: 0,
      };
    }
  }

  // Place mines (avoid spawn corners)
  const totalTiles = COLS * ROWS;
  const mineCount = Math.floor(totalTiles * MINE_DENSITY);
  let placed = 0;

  while (placed < mineCount) {
    const x = Math.floor(seededRand() * COLS);
    const y = Math.floor(seededRand() * ROWS);

    // Don't place on spawn tiles or their neighbors
    if (isNearSpawn(x, y, 0) || isNearSpawn(x, y, 1)) continue;
    if (board[y][x].mine) continue;

    board[y][x].mine = true;
    placed++;
  }

  // Calculate adjacency numbers
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (board[y][x].mine) continue;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS && board[ny][nx].mine) {
            count++;
          }
        }
      }
      board[y][x].adjacency = count;
    }
  }

  // Count safe tiles
  totalSafeTiles = 0;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!board[y][x].mine) totalSafeTiles++;
    }
  }

}

function isNearSpawn(x, y, playerIndex) {
  const p = players[playerIndex];
  return Math.abs(x - p.x) <= 1 && Math.abs(y - p.y) <= 1;
}

// ============================================================
// Tile Reveal (with Flood Fill)
// ============================================================

function revealTile(x, y, player, isFloodFill) {
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return;
  const tile = board[y][x];

  if (tile.state === TILE_FLAGGED) return;

  // Allow reclaiming neutral revealed tiles (e.g. after Color Drain)
  if (tile.state === TILE_REVEALED) {
    if (tile.owner === 0 && !tile.mine) {
      tile.owner = player.id;
      player.score++;
      playSound('claim');
    }
    return;
  }

  // Scorched tiles cannot be claimed by either player
  if (tile.scorchedFor > 0) return;

  if (tile.mine) {
    // Hit a mine!
    handleMineHit(x, y, player);
    return;
  }

  // Reveal and claim
  tile.state = TILE_REVEALED;
  resolvedSafeTileCount++;
  if (!isFloodFill) tile.revealAnimStart = performance.now();
  if (tile.owner === 0) {
    tile.owner = player.id;
    player.score++;
  }

  // Collect power-up if present — queues for auto-activation after 2s indicator
  if (tile.powerUp) {
    const now = performance.now();
    player.pendingPowerUps.push({ type: tile.powerUp, activateAt: now + 2000 });
    tile.powerUpFound = tile.powerUp;
    tile.powerUpFoundUntil = now + 2000;
    tile.powerUp = null;
    playSound('powerUpPickup');
  }

  if (!isFloodFill) {
    playSound(tile.adjacency === 0 ? 'claim' : 'reveal');
  }

  // Flood fill on zero tiles
  if (tile.adjacency === 0) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        revealTile(x + dx, y + dy, player, true);
      }
    }
  }

  if (!isFloodFill) checkGameEnd();
}

function handleMineHit(x, y, player) {
  const tile = board[y][x];

  // Shield absorbs the mine hit — reveal tile but no scorch/stun/teleport
  if (player.hasShield) {
    player.hasShield = false;
    tile.state = TILE_REVEALED;
    tile.revealAnimStart = performance.now();
    playSound('powerUpActivate');
    checkGameEnd();
    return;
  }

  // Scorch the mine tile and its neighbors for this player
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) {
        const neighbor = board[ny][nx];
        if (neighbor.state === TILE_HIDDEN && neighbor.scorchedFor === 0) {
          neighbor.scorchedFor = 3; // 3 = scorched for both players
          if (!neighbor.mine) resolvedSafeTileCount++;
        }
      }
    }
  }

  // Reveal the mine tile itself
  tile.state = TILE_REVEALED;
  tile.revealAnimStart = performance.now();

  spawnParticles(x, y, PALETTE_EXPLOSION);
  playSound('explosion');

  // Stun for 1.5 seconds, then teleport back to spawn
  player.stunUntil = performance.now() + 1500;
  player.teleportAfterStun = true;

  checkGameEnd();
}

// ============================================================
// Flagging
// ============================================================

function flagTile(x, y, player) {
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return;
  const tile = board[y][x];

  if (tile.state !== TILE_HIDDEN) return;

  if (tile.mine) {
    // Correct flag!
    tile.state = TILE_FLAGGED;
    tile.flaggedBy = player.id;
    tile.owner = player.id;
    player.score++;
    player.mines++;
    playSound('flag');
    checkGameEnd();
  } else {
    // Incorrect flag - small stun penalty
    player.stunUntil = performance.now() + 500;
    playSound('flagFail');
  }
}

// ============================================================
// Attack System
// ============================================================

function canAttack(player) {
  const now = performance.now();
  if (player.mines <= 0) return false;
  if (now < player.stunUntil) return false;
  if (now - player.lastAttack < ATTACK_COOLDOWN) return false;
  return true;
}

function randomMineAttack(attacker, forcedCenter = null) {
  if (!canAttack(attacker)) return;

  const opponent = players.find(p => p !== attacker);

  // Find opponent's claimed tiles
  const opponentTiles = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (board[y][x].owner === opponent.id && board[y][x].state === TILE_REVEALED) {
        opponentTiles.push({ x, y });
      }
    }
  }

  if (opponentTiles.length === 0) return;

  // Pick a random tile in opponent territory as center
  const center = forcedCenter ?? opponentTiles[Math.floor(Math.random() * opponentTiles.length)];
  if (onlineMode && !forcedCenter) sendGameEvent({ type: 'rndatk', cx: center.x, cy: center.y });

  // Convert tiles in radius to attacker's color
  const opponentFirewalled = performance.now() < opponent.firewallUntil;
  let converted = 0;
  for (let dy = -RANDOM_ATTACK_RADIUS; dy <= RANDOM_ATTACK_RADIUS; dy++) {
    for (let dx = -RANDOM_ATTACK_RADIUS; dx <= RANDOM_ATTACK_RADIUS; dx++) {
      const nx = center.x + dx;
      const ny = center.y + dy;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
      // Only convert within circular radius
      if (dx * dx + dy * dy > RANDOM_ATTACK_RADIUS * RANDOM_ATTACK_RADIUS + 1) continue;
      const tile = board[ny][nx];
      if (tile.state === TILE_REVEALED && tile.owner === opponent.id) {
        // Firewall protects all tiles
        if (opponentFirewalled) {
          addRumble(nx, ny);
          continue;
        }
        // Reinforced tiles absorb one hit
        if (tile.reinforced) {
          tile.reinforced = false;
          addRumble(nx, ny);
          continue;
        }
        tile.owner = attacker.id;
        tile.attackFlashUntil = performance.now() + 300;
        attacker.score++;
        opponent.score--;
        converted++;
        addRumble(nx, ny);
      }
    }
  }

  attacker.mines--;
  attacker.lastAttack = performance.now();

  // Stun opponent briefly
  if (converted > 0) {
    opponent.stunUntil = Math.max(opponent.stunUntil, performance.now() + RANDOM_ATTACK_STUN);
  }

  spawnParticles(center.x, center.y, PALETTE_ATTACK);
  playSound('attackRandom');
}

function precisionMineAttack(attacker) {
  if (!canAttack(attacker)) return;

  const opponent = players.find(p => p !== attacker);

  // Shield absorbs the precision attack — no conversion, no stun, no teleport
  if (opponent.hasShield) {
    opponent.hasShield = false;
    attacker.mines--;
    attacker.lastAttack = performance.now();
    playSound('powerUpActivate');
    return;
  }

  // Target opponent's exact position
  const cx = opponent.x;
  const cy = opponent.y;

  // Convert tiles in small radius around opponent
  const opponentFirewalled = performance.now() < opponent.firewallUntil;
  for (let dy = -PRECISION_ATTACK_RADIUS; dy <= PRECISION_ATTACK_RADIUS; dy++) {
    for (let dx = -PRECISION_ATTACK_RADIUS; dx <= PRECISION_ATTACK_RADIUS; dx++) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
      const tile = board[ny][nx];
      if (tile.state === TILE_REVEALED && tile.owner === opponent.id) {
        if (opponentFirewalled) {
          addRumble(nx, ny);
          continue;
        }
        if (tile.reinforced) {
          tile.reinforced = false;
          addRumble(nx, ny);
          continue;
        }
        tile.owner = attacker.id;
        tile.attackFlashUntil = performance.now() + 300;
        attacker.score++;
        opponent.score--;
        addRumble(nx, ny);
      }
    }
  }

  attacker.mines--;
  attacker.lastAttack = performance.now();

  // Long stun on opponent, then teleport back to spawn
  opponent.stunUntil = Math.max(opponent.stunUntil, performance.now() + PRECISION_ATTACK_STUN);
  opponent.teleportAfterStun = true;

  spawnParticles(cx, cy, PALETTE_ATTACK);
  playSound('attackPrecision');
}

// ============================================================
// Power-Up System
// ============================================================

function getPowerUpLetter(type) {
  switch (type) {
    case POWERUP_SHIELD: return 'S';
    case POWERUP_FIREWALL: return 'F';
    case POWERUP_REINFORCE: return 'R';
    case POWERUP_DRAIN: return 'D';
    default: return '?';
  }
}

function getPowerUpName(type) {
  switch (type) {
    case POWERUP_SHIELD: return 'Shield';
    case POWERUP_FIREWALL: return 'Firewall';
    case POWERUP_REINFORCE: return 'Reinforce';
    case POWERUP_DRAIN: return 'Drain';
    default: return '?';
  }
}

function trySpawnPowerUp() {
  if (!gameStarted || gameOver) return;
  if (onlineMode && localPlayerNum !== 1) return;
  const now = performance.now();
  if (now - lastPowerUpSpawn < POWERUP_SPAWN_INTERVAL) return;
  lastPowerUpSpawn = now;

  // Count existing power-ups on board
  let count = 0;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (board[y][x].powerUp) count++;
    }
  }
  if (count >= POWERUP_MAX_ON_BOARD) return;

  // Find eligible tiles
  const eligible = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const tile = board[y][x];
      if (tile.state !== TILE_HIDDEN) continue;
      if (tile.mine || tile.scorchedFor > 0 || tile.powerUp) continue;
      // Not near either player
      let nearPlayer = false;
      for (const p of players) {
        if (Math.abs(x - p.x) <= 2 && Math.abs(y - p.y) <= 2) {
          nearPlayer = true;
          break;
        }
      }
      if (nearPlayer) continue;
      eligible.push({ x, y });
    }
  }
  if (eligible.length === 0) return;

  const spot = eligible[Math.floor(Math.random() * eligible.length)];
  const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
  board[spot.y][spot.x].powerUp = type;
  if (onlineMode) sendGameEvent({ type: 'powerup_spawn', x: spot.x, y: spot.y, puType: type });
}

function applyPowerUp(player, type, forcedCenter = null) {
  if (type === POWERUP_SHIELD) {
    player.hasShield = true;
  } else if (type === POWERUP_FIREWALL) {
    player.firewallUntil = performance.now() + FIREWALL_DURATION;
  } else if (type === POWERUP_REINFORCE) {
    const ownedTiles = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (board[y][x].owner === player.id && board[y][x].state === TILE_REVEALED && !board[y][x].reinforced) {
          ownedTiles.push({ x, y });
        }
      }
    }
    if (ownedTiles.length > 0) {
      const center = forcedCenter ?? ownedTiles[Math.floor(Math.random() * ownedTiles.length)];
      for (let dy = -REINFORCE_RADIUS; dy <= REINFORCE_RADIUS; dy++) {
        for (let dx = -REINFORCE_RADIUS; dx <= REINFORCE_RADIUS; dx++) {
          if (dx * dx + dy * dy > REINFORCE_RADIUS * REINFORCE_RADIUS + 1) continue;
          const nx = center.x + dx;
          const ny = center.y + dy;
          if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
          const tile = board[ny][nx];
          if (tile.owner === player.id && tile.state === TILE_REVEALED) {
            tile.reinforced = true;
          }
        }
      }
    }
  } else if (type === POWERUP_DRAIN) {
    const opponent = players.find(p => p !== player);
    const opponentTiles = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (board[y][x].owner === opponent.id && board[y][x].state === TILE_REVEALED) {
          opponentTiles.push({ x, y });
        }
      }
    }
    if (opponentTiles.length > 0) {
      const center = forcedCenter ?? opponentTiles[Math.floor(Math.random() * opponentTiles.length)];
      for (let dy = -DRAIN_RADIUS; dy <= DRAIN_RADIUS; dy++) {
        for (let dx = -DRAIN_RADIUS; dx <= DRAIN_RADIUS; dx++) {
          if (dx * dx + dy * dy > DRAIN_RADIUS * DRAIN_RADIUS + 1) continue;
          const nx = center.x + dx;
          const ny = center.y + dy;
          if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
          const tile = board[ny][nx];
          if (tile.state === TILE_REVEALED && tile.owner === opponent.id) {
            tile.owner = 0;
            tile.reinforced = false;
            opponent.score--;
            addRumble(nx, ny);
          }
        }
      }
    }
  }
  playSound('powerUpActivate');
}

function processPendingPowerUps() {
  if (!gameStarted || gameOver) return;
  const now = performance.now();
  for (const player of players) {
    const ready = [];
    const still = [];
    for (const p of player.pendingPowerUps) {
      if (now >= p.activateAt) {
        ready.push(p);
      } else {
        still.push(p);
      }
    }
    player.pendingPowerUps = still;
    for (const p of ready) {
      if (onlineMode) {
        // Remote player's power-ups are applied when their event arrives, not here
        if (player !== players[localPlayerNum - 1]) continue;
        // For random power-ups, pick the center locally and send it so both clients agree
        let center = null;
        if (p.type === POWERUP_REINFORCE || p.type === POWERUP_DRAIN) {
          const pool = [];
          if (p.type === POWERUP_REINFORCE) {
            for (let y = 0; y < ROWS; y++)
              for (let x = 0; x < COLS; x++)
                if (board[y][x].owner === player.id && board[y][x].state === TILE_REVEALED && !board[y][x].reinforced)
                  pool.push({ x, y });
          } else {
            const opp = players.find(pl => pl !== player);
            for (let y = 0; y < ROWS; y++)
              for (let x = 0; x < COLS; x++)
                if (board[y][x].owner === opp.id && board[y][x].state === TILE_REVEALED)
                  pool.push({ x, y });
          }
          if (pool.length > 0) center = pool[Math.floor(Math.random() * pool.length)];
        }
        sendGameEvent({ type: 'powerup_activate', puType: p.type, cx: center?.x ?? null, cy: center?.y ?? null });
        applyPowerUp(player, p.type, center);
      } else {
        applyPowerUp(player, p.type);
      }
    }
  }
}

// ============================================================
// AI System (Single Player)
// ============================================================

function manhattanDist(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function aiAnalyzeBoard() {
  const now = performance.now();
  if (now - aiLastAnalysis < aiPreset.analysis) return;
  aiLastAnalysis = now;

  const mineSet = new Set();
  const safeSet = new Set();

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const tile = board[y][x];
      if (tile.state !== TILE_REVEALED || tile.mine || tile.adjacency === 0) continue;

      const hiddenNeighbors = [];
      let flaggedCount = 0;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
          const neighbor = board[ny][nx];
          if (neighbor.state === TILE_FLAGGED) flaggedCount++;
          else if (neighbor.state === TILE_HIDDEN && neighbor.scorchedFor === 0) {
            hiddenNeighbors.push({ x: nx, y: ny });
          }
        }
      }

      const remainingMines = tile.adjacency - flaggedCount;

      if (remainingMines === hiddenNeighbors.length && remainingMines > 0) {
        for (const n of hiddenNeighbors) mineSet.add(`${n.x},${n.y}`);
      }

      if (remainingMines === 0 && hiddenNeighbors.length > 0) {
        for (const n of hiddenNeighbors) safeSet.add(`${n.x},${n.y}`);
      }
    }
  }

  aiMineMemory = Array.from(mineSet).map(k => { const [x, y] = k.split(','); return { x: +x, y: +y }; });
  aiSafeMemory = Array.from(safeSet).map(k => { const [x, y] = k.split(','); return { x: +x, y: +y }; });
}

function aiIsTargetStale() {
  if (!aiTarget) return true;
  const tile = board[aiTarget.y][aiTarget.x];
  if (aiAction === 'reveal' && tile.state === TILE_REVEALED && tile.owner !== 0) return true;
  if (aiAction === 'flag' && tile.state !== TILE_HIDDEN) return true;
  if (tile.scorchedFor > 0) return true;
  return false;
}

function aiPickTarget() {
  const p = players[0];
  const opponent = players[1];

  // Priority 1: Flag known mines
  const flaggable = aiMineMemory.filter(m => board[m.y][m.x].state === TILE_HIDDEN);
  if (flaggable.length > 0 && Math.random() < aiPreset.flagChance) {
    flaggable.sort((a, b) => manhattanDist(p, a) - manhattanDist(p, b));
    aiTarget = flaggable[0];
    aiAction = 'flag';
    return;
  }

  // Priority 2: Reveal known safe tiles
  const safe = aiSafeMemory.filter(s => board[s.y][s.x].state === TILE_HIDDEN);
  if (safe.length > 0) {
    safe.sort((a, b) => manhattanDist(p, a) - manhattanDist(p, b));
    aiTarget = safe[0];
    aiAction = 'reveal';
    return;
  }

  // Priority 3: Claim neutral revealed tiles
  const neutral = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (board[y][x].state === TILE_REVEALED && board[y][x].owner === 0 && !board[y][x].mine) {
        neutral.push({ x, y });
      }
    }
  }
  if (neutral.length > 0) {
    neutral.sort((a, b) => manhattanDist(p, a) - manhattanDist(p, b));
    aiTarget = neutral[0];
    aiAction = 'reveal';
    return;
  }

  // Priority 4: Frontier tiles (hidden, adjacent to revealed)
  const frontier = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const tile = board[y][x];
      if (tile.state !== TILE_HIDDEN || tile.scorchedFor > 0) continue;

      let nearRevealed = false;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) {
            if (board[ny][nx].state === TILE_REVEALED) nearRevealed = true;
          }
        }
      }
      if (nearRevealed) {
        const distToAI = manhattanDist(p, { x, y });
        const distToOpp = manhattanDist(opponent, { x, y });
        frontier.push({ x, y, score: distToOpp - distToAI });
      }
    }
  }
  if (frontier.length > 0) {
    frontier.sort((a, b) => b.score - a.score);
    const topN = frontier.slice(0, Math.min(5, frontier.length));
    const pick = topN[Math.floor(Math.random() * topN.length)];
    aiTarget = { x: pick.x, y: pick.y };
    aiAction = 'reveal';
    return;
  }

  // Priority 5: Any hidden tile
  const hidden = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (board[y][x].state === TILE_HIDDEN && board[y][x].scorchedFor === 0) {
        hidden.push({ x, y });
      }
    }
  }
  if (hidden.length > 0) {
    hidden.sort((a, b) => manhattanDist(p, a) - manhattanDist(p, b));
    aiTarget = hidden[Math.floor(Math.random() * Math.min(3, hidden.length))];
    aiAction = 'reveal';
    return;
  }

  aiTarget = null;
  aiAction = null;
}

function aiPickRandomTarget() {
  const candidates = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (board[y][x].state === TILE_HIDDEN && board[y][x].scorchedFor === 0) {
        candidates.push({ x, y });
      }
    }
  }
  if (candidates.length > 0) {
    aiTarget = candidates[Math.floor(Math.random() * candidates.length)];
    aiAction = 'reveal';
  }
}

function aiMoveToward(target) {
  const p = players[0];
  const dx = Math.sign(target.x - p.x);
  const dy = Math.sign(target.y - p.y);

  if (Math.abs(target.x - p.x) >= Math.abs(target.y - p.y)) {
    if (dx !== 0) { tryMove(p, dx, 0); return; }
    if (dy !== 0) { tryMove(p, 0, dy); return; }
  } else {
    if (dy !== 0) { tryMove(p, 0, dy); return; }
    if (dx !== 0) { tryMove(p, dx, 0); return; }
  }
}

function aiPerformAction() {
  const p = players[0];
  if (!aiTarget || p.x !== aiTarget.x || p.y !== aiTarget.y) return;

  const tile = board[p.y][p.x];

  if (aiAction === 'flag' && tile.state === TILE_HIDDEN) {
    const scoreBefore = p.score;
    flagTile(p.x, p.y, p);
    // If flag failed, remove this tile from mine memory so AI doesn't retry it
    if (p.score <= scoreBefore) {
      aiMineMemory = aiMineMemory.filter(m => m.x !== aiTarget.x || m.y !== aiTarget.y);
    }
  } else if (aiAction === 'reveal') {
    if (tile.state === TILE_HIDDEN || (tile.state === TILE_REVEALED && tile.owner === 0)) {
      revealTile(p.x, p.y, p);
    }
  }

  aiTarget = null;
  aiAction = null;
}

function aiConsiderAttack() {
  const p = players[0];
  if (!canAttack(p)) return;

  const opponent = players[1];
  let opponentTileCount = 0;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (board[y][x].owner === opponent.id && board[y][x].state === TILE_REVEALED) {
        opponentTileCount++;
      }
    }
  }

  if (opponentTileCount < aiPreset.atkMinTiles) return;
  if (Math.random() > (1 - aiPreset.atkSkip)) return;

  const dist = manhattanDist(p, opponent);
  if (dist <= aiPreset.precisionDist && opponentTileCount >= aiPreset.precisionTiles && p.mines >= aiPreset.precisionMines) {
    precisionMineAttack(p);
  } else if (opponentTileCount >= aiPreset.randomTiles && p.mines >= aiPreset.randomMines) {
    randomMineAttack(p);
  } else if (p.mines >= aiPreset.stockpileMines) {
    randomMineAttack(p);
  }
}

function updateAI() {
  if (!singlePlayer || !gameStarted || gameOver) return;

  const now = performance.now();
  const p = players[0];

  if (now < p.stunUntil) return;
  if (now - aiLastTick < aiPreset.tick) return;
  aiLastTick = now;

  if (aiHesitation > 0) {
    aiHesitation -= aiPreset.tick;
    return;
  }

  aiAnalyzeBoard();

  if (aiTarget && p.x === aiTarget.x && p.y === aiTarget.y) {
    aiPerformAction();
    if (Math.random() < aiPreset.hesitateChance) {
      aiHesitation = aiPreset.hesitateDur[0] + Math.random() * aiPreset.hesitateDur[1];
    }
  }

  if (!aiTarget || aiIsTargetStale()) {
    if (Math.random() < aiPreset.mistake) {
      aiPickRandomTarget();
    } else {
      aiPickTarget();
    }
  }

  if (aiTarget) {
    aiMoveToward(aiTarget);
  }

  aiConsiderAttack();
}

// ============================================================
// Game End Check
// ============================================================

function countResolvedSafeTiles() {
  let count = 0;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const tile = board[y][x];
      if (tile.mine) continue;
      // Safe tile is resolved if revealed or scorched
      if (tile.state === TILE_REVEALED || tile.scorchedFor > 0) count++;
    }
  }
  return count;
}

function checkGameEnd() {
  if (resolvedSafeTileCount >= totalSafeTiles) {
    endGame();
  }
}

function endGame() {
  if (gameOver) return;
  gameOver = true;
  gameFinishTime = performance.now();
  clearTouchMovementKeys();
  if (players[0].score > players[1].score) {
    winner = 1;
  } else if (players[1].score > players[0].score) {
    winner = 2;
  } else {
    winner = 0; // tie
  }
  bgMusic.pause();
  bgMusic.currentTime = 0;
  const isDefeat = (singlePlayer && winner === 1) ||
                   (onlineMode && winner !== 0 && winner !== localPlayerNum);
  if (!musicMuted) (isDefeat ? defeatMusic : victoryMusic).play().catch(() => {});
  playSound('gameOver');
  updateStatusText();
}

// ============================================================
// Player Movement
// ============================================================

function tryMove(player, dx, dy) {
  const now = performance.now();
  if (now < player.stunUntil) return;
  if (now - player.lastMove < MOVE_COOLDOWN) return;

  const nx = player.x + dx;
  const ny = player.y + dy;

  // Bounds check
  if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) return;

  // Collision with other player
  const other = players.find(p => p !== player);
  if (other.x === nx && other.y === ny) return;

  player.x = nx;
  player.y = ny;
  player.lastMove = now;
  if (onlineMode && player === players[localPlayerNum - 1]) {
    sendGameEvent({ type: 'move', x: player.x, y: player.y });
  }
}

// ============================================================
// Input Handling
// ============================================================

document.addEventListener('keydown', (e) => {
  keysDown[e.key] = true;

  if (gameOver && e.key === ' ') {
    returnToMenu();
    return;
  }

  if (!gameStarted || gameOver) return;

  if (onlineMode) {
    // Online: both players use P2 controls (/ . 9 0)
    const lp = players[localPlayerNum - 1];
    if (e.key === '/') {
      e.preventDefault();
      revealTile(lp.x, lp.y, lp);
      sendGameEvent({ type: 'reveal', x: lp.x, y: lp.y });
    }
    if (e.key === '.') {
      flagTile(lp.x, lp.y, lp);
      sendGameEvent({ type: 'flag', x: lp.x, y: lp.y });
    }
    if (e.key === '9') {
      randomMineAttack(lp); // rndatk event sent inside function
    }
    if (e.key === '0') {
      precisionMineAttack(lp);
      sendGameEvent({ type: 'precatk' });
    }
  } else {
    // Offline P1 controls: E reveal, Q flag, 1/2 attacks
    if (!singlePlayer) {
      if (e.key === 'e' || e.key === 'E') revealTile(players[0].x, players[0].y, players[0]);
      if (e.key === 'q' || e.key === 'Q') flagTile(players[0].x, players[0].y, players[0]);
      if (e.key === '1') randomMineAttack(players[0]);
      if (e.key === '2') precisionMineAttack(players[0]);
    }

    // Offline P2 controls: / reveal, . flag, 9/0 attacks
    if (e.key === '/') {
      e.preventDefault();
      revealTile(players[1].x, players[1].y, players[1]);
    }
    if (e.key === '.') flagTile(players[1].x, players[1].y, players[1]);
    if (e.key === '9') randomMineAttack(players[1]);
    if (e.key === '0') precisionMineAttack(players[1]);
  }

});

document.addEventListener('keyup', (e) => {
  keysDown[e.key] = false;
});

// ============================================================
// Online Multiplayer
// ============================================================

function sendGameEvent(data) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'event', data }));
  }
}

function handleRemoteEvent(ev) {
  const remoteIdx = localPlayerNum === 1 ? 1 : 0;
  const remote = players[remoteIdx];
  switch (ev.type) {
    case 'move':
      remote.x = ev.x;
      remote.y = ev.y;
      break;
    case 'reveal':
      revealTile(ev.x, ev.y, remote);
      break;
    case 'flag':
      flagTile(ev.x, ev.y, remote);
      break;
    case 'rndatk':
      randomMineAttack(remote, { x: ev.cx, y: ev.cy });
      break;
    case 'precatk':
      precisionMineAttack(remote);
      break;
    case 'powerup_spawn':
      board[ev.y][ev.x].powerUp = ev.puType;
      break;
    case 'powerup_activate': {
      const center = ev.cx != null ? { x: ev.cx, y: ev.cy } : null;
      applyPowerUp(remote, ev.puType, center);
      break;
    }
  }
}

function startOnlineGame(matchType) {
  onlineMode = true;
  opponentLeft = false;
  document.getElementById('menu-screen').style.display = 'none';
  document.getElementById('online-status-screen').style.display = 'flex';
  showOnlineStatus('connecting');

  socket = new WebSocket(WS_URL);
  socket.onopen = () => socket.send(JSON.stringify({ type: matchType === 'quickmatch' ? 'quickmatch' : 'create_room' }));
  socket.onmessage = handleMatchmakingMessage;
  socket.onerror = () => showOnlineStatus('error');
  socket.onclose = () => {
    if (onlineMode && gameStarted && !gameOver) {
      opponentLeft = true;
      gameOver = true;
      clearTouchMovementKeys();
    }
  };
}

function joinRoomOnline(code) {
  if (!code || code.length !== 4) return;
  onlineMode = true;
  opponentLeft = false;
  document.getElementById('menu-screen').style.display = 'none';
  document.getElementById('online-status-screen').style.display = 'flex';
  showOnlineStatus('connecting');

  socket = new WebSocket(WS_URL);
  socket.onopen = () => socket.send(JSON.stringify({ type: 'join_room', code: code.toUpperCase() }));
  socket.onmessage = handleMatchmakingMessage;
  socket.onerror = () => showOnlineStatus('error');
}

function handleMatchmakingMessage(e) {
  const msg = JSON.parse(e.data);
  if (msg.type === 'waiting') {
    showOnlineStatus('waiting');
  } else if (msg.type === 'room_created') {
    showOnlineStatus('room', msg.code);
  } else if (msg.type === 'room_not_found') {
    showOnlineStatus('room_not_found');
  } else if (msg.type === 'matched') {
    localPlayerNum = msg.playerNum;
    seededRand = makePRNG(msg.seed);
    document.getElementById('online-status-screen').style.display = 'none';
    socket.onmessage = (ev) => {
      const data = JSON.parse(ev.data);
      if (data.type === 'event') handleRemoteEvent(data.data);
      else if (data.type === 'opponent_left') {
        opponentLeft = true;
        gameOver = true;
        clearTouchMovementKeys();
      }
    };
    startGame();
  }
}

function showOnlineStatus(state, code) {
  const text   = document.getElementById('online-status-text');
  const codeEl = document.getElementById('online-room-code');
  const joinEl = document.getElementById('online-join-input');
  codeEl.style.display = 'none';
  joinEl.style.display = 'none';
  const messages = {
    connecting:     'Connecting...',
    waiting:        'Finding opponent...',
    room_not_found: 'Room not found. Check the code and try again.',
    error:          'Connection failed. Is the server running?',
  };
  text.textContent = messages[state] ?? '';
  if (state === 'room') {
    text.textContent = 'Share this code with your friend:';
    codeEl.textContent = code;
    codeEl.style.display = 'block';
  }
  if (state === 'room_not_found') joinEl.style.display = 'flex';
}

function cancelOnline() {
  if (socket) { socket.onclose = null; socket.close(); socket = null; }
  onlineMode = false;
  localPlayerNum = 0;
  document.getElementById('online-status-screen').style.display = 'none';
  document.getElementById('menu-screen').style.display = 'flex';
  showMenu('main');
}

function scaleCanvas() {
  if (!canvas) return;
  const available = window.innerWidth - 8; // 8px breathing room for border
  if (available < canvas.width) {
    const scale = available / canvas.width;
    canvas.style.width  = Math.round(canvas.width  * scale) + 'px';
    canvas.style.height = Math.round(canvas.height * scale) + 'px';
  } else {
    canvas.style.width  = canvas.width  + 'px';
    canvas.style.height = canvas.height + 'px';
  }
}

window.addEventListener('resize', scaleCanvas);

function processMovementInput() {
  if (!gameStarted || gameOver) return;

  if (onlineMode) {
    // Both players use arrow keys in online mode
    const lp = players[localPlayerNum - 1];
    if (keysDown['ArrowUp'])    tryMove(lp, 0, -1);
    if (keysDown['ArrowDown'])  tryMove(lp, 0, 1);
    if (keysDown['ArrowLeft'])  tryMove(lp, -1, 0);
    if (keysDown['ArrowRight']) tryMove(lp, 1, 0);
  } else {
    // P1: WASD — skip when AI controls P1
    if (!singlePlayer) {
      if (keysDown['w'] || keysDown['W']) tryMove(players[0], 0, -1);
      if (keysDown['s'] || keysDown['S']) tryMove(players[0], 0, 1);
      if (keysDown['a'] || keysDown['A']) tryMove(players[0], -1, 0);
      if (keysDown['d'] || keysDown['D']) tryMove(players[0], 1, 0);
    }
    // P2: Arrow keys
    if (keysDown['ArrowUp'])    tryMove(players[1], 0, -1);
    if (keysDown['ArrowDown'])  tryMove(players[1], 0, 1);
    if (keysDown['ArrowLeft'])  tryMove(players[1], -1, 0);
    if (keysDown['ArrowRight']) tryMove(players[1], 1, 0);
  }
}

// ============================================================
// Rendering
// ============================================================

let renderNow = 0;
let firewallShimmer = 0;

function render() {
  renderNow = performance.now();
  firewallShimmer = 0.5 + 0.5 * Math.sin(renderNow / 500);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw tiles
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      drawTile(x, y);
    }
  }

  // Draw particles (above tiles, below players)
  drawParticles();

  // Draw players
  drawPlayer(players[0], COLORS.p1Player);
  drawPlayer(players[1], COLORS.p2Player);

  // Game over overlay
  if (gameOver) {
    drawGameOverOverlay();
  }
}

function drawTile(x, y) {
  const now = renderNow;
  const tile = board[y][x];
  const rumbleExp = rumbleUntil[y * COLS + x];
  const px = x * TILE_SIZE + (rumbleExp > now ? (Math.random() - 0.5) * 2 * RUMBLE_INTENSITY : 0);
  const py = y * TILE_SIZE + (rumbleExp > now ? (Math.random() - 0.5) * 2 * RUMBLE_INTENSITY : 0);

  // Reveal pop-in scale animation
  const elapsed = now - tile.revealAnimStart;
  let s = 1;
  if (tile.revealAnimStart > 0 && elapsed < 180) {
    const t = elapsed / 180;
    s = t < 0.65 ? (t / 0.65) * 1.15 : 1.15 - ((t - 0.65) / 0.35) * 0.15;
  }
  if (s !== 1) {
    const cx = px + TILE_SIZE / 2;
    const cy = py + TILE_SIZE / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.translate(-cx, -cy);
  }

  if (tile.state === TILE_HIDDEN) {
    // Check if scorched
    if (tile.scorchedFor > 0) {
      ctx.fillStyle = COLORS.scorched;
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      ctx.strokeStyle = COLORS.scorchedBorder;
      ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
      // Show adjacency number or mine on scorched tiles
      if (tile.mine) {
        ctx.fillStyle = '#888';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✸', px + TILE_SIZE / 2, py + TILE_SIZE / 2);
      } else if (tile.adjacency > 0) {
        ctx.fillStyle = '#888';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tile.adjacency, px + TILE_SIZE / 2, py + TILE_SIZE / 2);
      }
    } else {
      ctx.fillStyle = COLORS.unrevealed;
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      ctx.strokeStyle = COLORS.unrevealedBorder;
      ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);

    }
  } else if (tile.state === TILE_FLAGGED) {
    // Flagged mine
    const flagColor = tile.flaggedBy === 1 ? COLORS.flagP1 : COLORS.flagP2;
    const claimColor = tile.flaggedBy === 1 ? COLORS.p1Claim : COLORS.p2Claim;
    ctx.fillStyle = claimColor;
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    ctx.strokeStyle = flagColor;
    ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
    // Draw flag icon
    ctx.fillStyle = flagColor;
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚑', px + TILE_SIZE / 2, py + TILE_SIZE / 2);
  } else if (tile.state === TILE_REVEALED) {
    if (tile.mine) {
      // Revealed mine (player hit it)
      ctx.fillStyle = COLORS.scorched;
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      ctx.strokeStyle = COLORS.scorchedBorder;
      ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
      ctx.fillStyle = '#ffeb3b';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✸', px + TILE_SIZE / 2, py + TILE_SIZE / 2);
    } else {
      // Claimed safe tile
      if (tile.owner === 1) {
        ctx.fillStyle = COLORS.p1Claim;
        ctx.strokeStyle = COLORS.p1ClaimBorder;
      } else if (tile.owner === 2) {
        ctx.fillStyle = COLORS.p2Claim;
        ctx.strokeStyle = COLORS.p2ClaimBorder;
      } else {
        ctx.fillStyle = COLORS.revealed;
        ctx.strokeStyle = COLORS.revealedBorder;
      }
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);

      // Reinforced matte overlay
      if (tile.reinforced) {
        ctx.fillStyle = 'rgba(80, 80, 80, 0.35)';
        ctx.fillRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        // Matte crosshatch lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + 2, py + TILE_SIZE - 2);
        ctx.lineTo(px + TILE_SIZE - 2, py + 2);
        ctx.moveTo(px + 2, py + TILE_SIZE / 2);
        ctx.lineTo(px + TILE_SIZE / 2, py + 2);
        ctx.moveTo(px + TILE_SIZE / 2, py + TILE_SIZE - 2);
        ctx.lineTo(px + TILE_SIZE - 2, py + TILE_SIZE / 2);
        ctx.stroke();
        ctx.lineWidth = 1;
      }

      // Firewall metallic shine
      if (tile.owner > 0 && now < players[tile.owner - 1].firewallUntil) {
        ctx.fillStyle = `rgba(200, 220, 255, ${0.08 + 0.12 * firewallShimmer})`;
        ctx.fillRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
      }

      // Draw number
      if (tile.adjacency > 0) {
        ctx.fillStyle = COLORS.numberColors[tile.adjacency] || '#fff';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tile.adjacency, px + TILE_SIZE / 2, py + TILE_SIZE / 2);
      }

      // Power-up found indicator (2s flash)
      if (tile.powerUpFound && now < tile.powerUpFoundUntil) {
        const pulse = 0.5 + 0.5 * Math.sin(now / 150);
        ctx.fillStyle = `rgba(255, 215, 0, ${0.25 + 0.25 * pulse})`;
        ctx.fillRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${0.7 + 0.3 * pulse})`;
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(getPowerUpLetter(tile.powerUpFound), px + TILE_SIZE / 2, py + TILE_SIZE / 2);
      }

      // Attack flash overlay
      if (tile.attackFlashUntil && now < tile.attackFlashUntil) {
        const flashProgress = (now - (tile.attackFlashUntil - 300)) / 300;
        ctx.fillStyle = `rgba(255, 255, 255, ${(1 - flashProgress) * 0.8})`;
        ctx.fillRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
      }
    }
  }

  if (s !== 1) ctx.restore();
}

function drawPlayer(player, color) {
  const px = player.renderX * TILE_SIZE;
  const py = player.renderY * TILE_SIZE;
  const cx = px + TILE_SIZE / 2;
  const cy = py + TILE_SIZE / 2;
  const r = TILE_SIZE / 2 - 3;

  const now = performance.now();
  const isStunned = now < player.stunUntil;

  // Glow effect
  ctx.shadowColor = color;
  ctx.shadowBlur = isStunned ? 3 : 8;

  // Player circle
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = isStunned ? '#666' : color;
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Player number
  ctx.shadowBlur = 0;
  ctx.fillStyle = isStunned ? '#aaa' : '#fff';
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(player.id, cx, cy);

  // Stun indicator
  if (isStunned) {
    ctx.fillStyle = '#ffeb3b';
    ctx.font = '10px monospace';
    ctx.fillText('⚡', cx, cy - r - 4);
  }

  // Shield indicator (blue ring)
  if (player.hasShield) {
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 300);
    // Outer glow
    ctx.beginPath();
    ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(100, 200, 255, ${0.3 * pulse})`;
    ctx.lineWidth = 6;
    ctx.stroke();
    // Main ring
    ctx.beginPath();
    ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(100, 200, 255, ${0.9 * pulse})`;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
  ctx.lineWidth = 1;
}

function drawGameOverOverlay() {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;

  if (opponentLeft) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('Opponent disconnected', centerX, centerY - 20);
    ctx.fillStyle = '#aaa';
    ctx.font = '16px sans-serif';
    ctx.fillText('Press SPACE to return to menu', centerX, centerY + 20);
    return;
  }

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 32px sans-serif';
  const p1Label = singlePlayer ? 'AI' : 'Player 1';
  const p2Label = singlePlayer ? 'You' : 'Player 2';

  if (winner === 0) {
    ctx.fillText("It's a Tie!", centerX, centerY - 30);
  } else {
    const winColor = winner === 1 ? COLORS.p1Player : COLORS.p2Player;
    ctx.fillStyle = winColor;
    const winLabel = winner === 1 ? p1Label : p2Label;
    ctx.fillText(`${winLabel} Win${winner === 2 && singlePlayer ? '' : 's'}!`, centerX, centerY - 30);
  }

  ctx.fillStyle = '#aaa';
  ctx.font = '16px sans-serif';
  ctx.fillText(`${p1Label}: ${players[0].score}  —  ${p2Label}: ${players[1].score}`, centerX, centerY + 10);

  if (singlePlayer && gameFinishTime) {
    ctx.fillStyle = '#888';
    ctx.font = '15px sans-serif';
    ctx.fillText(`Time: ${formatTime(gameFinishTime - gameStartTime)}`, centerX, centerY + 35);
  }

  ctx.fillStyle = '#777';
  ctx.font = '14px sans-serif';
  ctx.fillText('Press SPACE to return to menu', centerX, centerY + (singlePlayer ? 60 : 45));
}


// ============================================================
// UI Updates
// ============================================================

function updateUI() {
  const now = performance.now();

  document.getElementById('p1-score').textContent = `Tiles: ${players[0].score}`;
  document.getElementById('p2-score').textContent = `Tiles: ${players[1].score}`;

  document.getElementById('p1-mines').textContent = `Mines: ${players[0].mines}`;
  document.getElementById('p2-mines').textContent = `Mines: ${players[1].mines}`;

  // Cooldown indicators
  const p1cd = Math.max(0, ATTACK_COOLDOWN - (now - players[0].lastAttack));
  const p2cd = Math.max(0, ATTACK_COOLDOWN - (now - players[1].lastAttack));
  document.getElementById('p1-cooldown').textContent = p1cd > 0 ? `ATK: ${(p1cd / 1000).toFixed(1)}s` : (players[0].mines > 0 ? 'ATK: Ready' : '');
  document.getElementById('p2-cooldown').textContent = p2cd > 0 ? `ATK: ${(p2cd / 1000).toFixed(1)}s` : (players[1].mines > 0 ? 'ATK: Ready' : '');

  // Power-up pending display
  for (let i = 0; i < 2; i++) {
    const player = players[i];
    const el = document.getElementById(`p${i + 1}-powerups`);
    if (!el) continue;
    if (player.pendingPowerUps.length === 0) {
      el.innerHTML = '';
      continue;
    }
    el.innerHTML = player.pendingPowerUps.map(p => {
      return `<span class="pu-item">${getPowerUpName(p.type)}</span>`;
    }).join('');
  }
}

let lastStatusUpdate = 0;
function updateStatusText() {
  const el = document.getElementById('game-status');
  const timerEl = document.getElementById('game-timer');
  if (!el) return;
  if (gameOver) {
    if (winner === 0) el.textContent = "Game Over — Tie!";
    else {
      const label = singlePlayer ? (winner === 1 ? 'AI' : 'You') : `Player ${winner}`;
      el.textContent = `Game Over — ${label} Win${winner === 2 && singlePlayer ? '' : 's'}!`;
    }
    if (timerEl) timerEl.textContent = '';
  } else if (gameStarted) {
    const now = performance.now();
    if (now - lastStatusUpdate > 100) {
      lastStatusUpdate = now;
      el.textContent = `Tiles remaining: ${totalSafeTiles - resolvedSafeTileCount}`;
      if (timerEl && singlePlayer) timerEl.innerHTML = `Play Time<br>${formatTime(now - gameStartTime)}`;
    }
  }
}

// ============================================================
// Game Loop
// ============================================================

function snapPlayerRender(player) {
  player.renderX = player.x;
  player.renderY = player.y;
}

function updatePlayerRenderPositions() {
  for (const p of players) {
    p.renderX += (p.x - p.renderX) * 0.35;
    p.renderY += (p.y - p.renderY) * 0.35;
  }
}

function processStunTeleports() {
  const now = performance.now();
  for (const player of players) {
    if (player.teleportAfterStun && now >= player.stunUntil) {
      const spawn = SPAWNS[player.id - 1];
      player.x = spawn.x;
      player.y = spawn.y;
      snapPlayerRender(player);
      player.teleportAfterStun = false;
      playSound('teleport');
    }
  }
}

function gameLoop() {
  processStunTeleports();
  trySpawnPowerUp();
  processPendingPowerUps();
  if (singlePlayer) updateAI();
  processMovementInput();
  updatePlayerRenderPositions();
  updateParticles();
  render();
  updateUI();

  if (gameStarted && !gameOver) {
    updateStatusText();
  }

  requestAnimationFrame(gameLoop);
}

// ============================================================
// Reset / Init
// ============================================================

// ============================================================
// Init — reset players for a fresh game
// ============================================================

function resetPlayers() {
  for (const [i, player] of players.entries()) {
    player.x = SPAWNS[i].x;
    player.y = SPAWNS[i].y;
    player.score = 0;
    player.stunUntil = 0;
    player.lastMove = 0;
    player.lastAttack = 0;
    player.mines = 0;
    player.teleportAfterStun = false;
    player.pendingPowerUps = [];
    player.hasShield = false;
    player.firewallUntil = 0;
    snapPlayerRender(player);
  }
  particles = [];
}
