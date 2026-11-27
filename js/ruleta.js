/* =============================================
   UNSPOTTED — Ruleta de premios (panel admin)
   Vanilla JS, sin dependencias. Vive dentro de dashboard-view
   en admin.html, por lo que ya está protegida por el login.
   ============================================= */

/* --- Config: edita nombres y pesos aquí --- */
const RULETA_CONFIG = {
  prizes: [
    { id: 'sticker', name: 'Sticker UNSPOTTED', weight: 30 },
    { id: 'pack-stickers', name: 'Gira otra vez', weight: 25 },
    { id: 'prioridad-tracksuit', name: '2 por 800', weight: 20 },
    { id: 'descuento-tracksuit', name: 'Descuento en la preventa del tracksuit', weight: 15 },
    { id: 'prioridad-beanie', name: '10% extra', weight: 9 },
    { id: 'camisa-gratis', name: 'CAMISA GRATIS', weight: 1, isGrandPrize: true },
  ],
};

/* --- Paleta de la rueda: alterna negro / charcoal / off-white, sin colores de casino --- */
const RULETA_COLORS = ['#000000', '#333333', '#EDEAE2'];
const RULETA_OFFWHITE = '#EDEAE2';

/* --- Claves de localStorage (todo el acceso va envuelto en try/catch) --- */
const LS_WON_DATE = 'ruleta_won_date';
const LS_LOG = 'ruleta_log';
const LS_MUTED = 'ruleta_muted';

/* =============================================
   Elementos del DOM
   ============================================= */
const canvas = document.getElementById('ruleta-canvas');
const ctx = canvas.getContext('2d');
const wheelWrap = document.getElementById('ruleta-wheel-wrap');
const spinControls = document.getElementById('ruleta-spin-controls');
const spinBtn = document.getElementById('ruleta-spin-btn');
const normalSlot = document.getElementById('ruleta-normal-slot');
const fsOverlay = document.getElementById('ruleta-fullscreen-overlay');
const fsSlot = document.getElementById('ruleta-fullscreen-slot');
const fsLogo = document.getElementById('ruleta-fs-logo');
const muteBtn = document.getElementById('ruleta-mute-btn');
const fullscreenBtn = document.getElementById('ruleta-fullscreen-btn');
const resetBtn = document.getElementById('ruleta-reset-btn');
const resetMsg = document.getElementById('ruleta-reset-msg');
const spinsCountEl = document.getElementById('ruleta-spins-count');
const logTbody = document.getElementById('ruleta-log-tbody');
const logEmpty = document.getElementById('ruleta-log-empty');
const clearHistoryBtn = document.getElementById('ruleta-clear-history-btn');
const revealOverlay = document.getElementById('ruleta-reveal-overlay');
const revealPrizeEl = document.getElementById('ruleta-reveal-prize');
const revealNextBtn = document.getElementById('ruleta-reveal-next-btn');

const BASE_SIZE = 360; // resolución lógica del canvas; el tamaño en pantalla lo controla el CSS
let currentRotation = 0; // grados acumulados aplicados al canvas, para encadenar giros
let isSpinning = false;

/* =============================================
   Persistencia (localStorage con try/catch)
   ============================================= */
function getTodayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function loadWonDate() {
  try {
    return localStorage.getItem(LS_WON_DATE);
  } catch (e) {
    return null;
  }
}

function saveWonDate(dateStr) {
  try {
    if (dateStr) {
      localStorage.setItem(LS_WON_DATE, dateStr);
    } else {
      localStorage.removeItem(LS_WON_DATE);
    }
  } catch (e) {
    console.error('No se pudo guardar el estado de la ruleta:', e);
  }
}

// El premio mayor solo puede ganarse una vez por día: si la fecha guardada
// no es la de hoy, se considera disponible de nuevo automáticamente.
function isGrandPrizeWonToday() {
  return loadWonDate() === getTodayStr();
}

function loadLog() {
  try {
    return JSON.parse(localStorage.getItem(LS_LOG)) || [];
  } catch (e) {
    return [];
  }
}

function saveLog(log) {
  try {
    localStorage.setItem(LS_LOG, JSON.stringify(log));
  } catch (e) {
    console.error('No se pudo guardar el historial de la ruleta:', e);
  }
}

function addLogEntry(prizeName) {
  const log = loadLog();
  log.unshift({ prize: prizeName, time: new Date().toISOString() });
  saveLog(log);
  renderLog();
  renderSpinsCount();
}

function isMuted() {
  try {
    return localStorage.getItem(LS_MUTED) === '1';
  } catch (e) {
    return false;
  }
}

function setMuted(muted) {
  try {
    localStorage.setItem(LS_MUTED, muted ? '1' : '0');
  } catch (e) {
    console.error('No se pudo guardar la preferencia de sonido:', e);
  }
}

/* =============================================
   Lógica de premios
   ============================================= */
function getAvailablePrizes() {
  return RULETA_CONFIG.prizes.filter((p) => !(p.isGrandPrize && isGrandPrizeWonToday()));
}

function pickWeightedPrize(prizes) {
  const total = prizes.reduce((sum, p) => sum + p.weight, 0);
  let r = Math.random() * total;
  for (const p of prizes) {
    if (r < p.weight) return p;
    r -= p.weight;
  }
  return prizes[prizes.length - 1];
}

/* =============================================
   Dibujo de la rueda (canvas)
   ============================================= */
function setupCanvasResolution() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = BASE_SIZE * dpr;
  canvas.height = BASE_SIZE * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // dibujamos siempre en unidades lógicas BASE_SIZE
}

// PRNG determinista simple (mulberry32) para que las manchas de cada rebanada
// sean siempre iguales mientras no cambie la lista de premios.
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Mancha orgánica irregular (tipo "spot" de la marca), no un círculo perfecto.
function drawOrganicBlob(context, cx, cy, baseRadius, rng) {
  const points = 7 + Math.floor(rng() * 3);
  const angleStep = (Math.PI * 2) / points;
  const coords = [];
  for (let i = 0; i < points; i++) {
    const angle = i * angleStep;
    const radius = baseRadius * (0.6 + rng() * 0.5);
    coords.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
  }
  context.beginPath();
  context.moveTo(coords[0][0], coords[0][1]);
  for (let i = 0; i < points; i++) {
    const curr = coords[i];
    const next = coords[(i + 1) % points];
    const midX = (curr[0] + next[0]) / 2;
    const midY = (curr[1] + next[1]) / 2;
    context.quadraticCurveTo(curr[0], curr[1], midX, midY);
  }
  context.closePath();
}

function wrapTextToLines(context, text, maxWidth, maxLines) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (context.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, maxLines);
}

// Reduce el tamaño de fuente hasta que el texto quepa envuelto en máx. 2 líneas.
function fitLabel(context, text, maxWidth, maxLines, baseSize) {
  let size = baseSize;
  let lines = [text];
  while (size > 8) {
    context.font = `700 ${size}px 'Bebas Neue', sans-serif`;
    lines = wrapTextToLines(context, text, maxWidth, maxLines);
    const widest = Math.max(...lines.map((l) => context.measureText(l).width));
    if (widest <= maxWidth) break;
    size -= 1;
  }
  return { size, lines };
}

function drawSliceLabel(index, total, prize, bgColor) {
  const sliceAngle = (Math.PI * 2) / total;
  const midAngle = -Math.PI / 2 + (index + 0.5) * sliceAngle;
  const cx = BASE_SIZE / 2;
  const cy = BASE_SIZE / 2;
  const textRadius = (BASE_SIZE / 2) * 0.62;
  const maxWidth = textRadius * sliceAngle * 0.82;

  // En la mitad inferior de la rueda el texto se voltea 180° para que no
  // quede de cabeza; se compensa dibujando hacia +radio en vez de -radio.
  const angleFromTop = ((midAngle + Math.PI / 2) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  const isBottomHalf = angleFromTop > Math.PI / 2 && angleFromTop < (Math.PI * 3) / 2;
  const radiusSign = isBottomHalf ? 1 : -1;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(midAngle + Math.PI / 2 + (isBottomHalf ? Math.PI : 0));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = bgColor === RULETA_OFFWHITE ? '#000000' : '#FFFFFF';

  const baseSize = prize.isGrandPrize ? 16 : 13;
  const { lines } = fitLabel(ctx, prize.name.toUpperCase(), maxWidth, 2, baseSize);
  const lineHeight = baseSize + 3;
  const startY = radiusSign * textRadius - radiusSign * ((lines.length - 1) * lineHeight) / 2;

  lines.forEach((line, i) => {
    ctx.fillText(line, 0, startY + i * lineHeight);
  });

  ctx.restore();
}

function drawSlice(index, total, prize) {
  const sliceAngle = (Math.PI * 2) / total;
  const startAngle = -Math.PI / 2 + index * sliceAngle;
  const endAngle = startAngle + sliceAngle;
  const cx = BASE_SIZE / 2;
  const cy = BASE_SIZE / 2;
  const radius = BASE_SIZE / 2 - 4;
  const bgColor = RULETA_COLORS[index % RULETA_COLORS.length];

  // Relleno de la rebanada
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, radius, startAngle, endAngle);
  ctx.closePath();
  ctx.fillStyle = bgColor;
  ctx.fill();

  // Manchas orgánicas recortadas dentro de la rebanada (motivo "spots" de la marca)
  ctx.clip();
  const rng = mulberry32(hashString(prize.id));
  const blotchColor = bgColor === RULETA_OFFWHITE ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
  for (let b = 0; b < 4; b++) {
    const dist = radius * (0.25 + rng() * 0.6);
    const angle = startAngle + sliceAngle * rng();
    const bx = cx + Math.cos(angle) * dist;
    const by = cy + Math.sin(angle) * dist;
    drawOrganicBlob(ctx, bx, by, radius * (0.08 + rng() * 0.08), rng);
    ctx.fillStyle = blotchColor;
    ctx.fill();
  }
  ctx.restore();

  // Borde sutil entre rebanadas
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, radius, startAngle, endAngle);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  drawSliceLabel(index, total, prize, bgColor);
}

function renderWheel() {
  const prizes = getAvailablePrizes();
  const total = prizes.length;

  ctx.clearRect(0, 0, BASE_SIZE, BASE_SIZE);
  prizes.forEach((prize, index) => drawSlice(index, total, prize));

  // Aro exterior
  ctx.save();
  ctx.beginPath();
  ctx.arc(BASE_SIZE / 2, BASE_SIZE / 2, BASE_SIZE / 2 - 2, 0, Math.PI * 2);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

/* =============================================
   Sonido (Web Audio API, sin archivos de audio)
   ============================================= */
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    // @ts-ignore — webkitAudioContext es el prefijo de Safari viejo, no está en los tipos de DOM estándar
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playTone(freq, duration, type, volume) {
  if (isMuted()) return;
  try {
    const context = getAudioCtx();
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume || 0.15, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start();
    osc.stop(context.currentTime + duration);
  } catch (e) {
    console.error('No se pudo reproducir el sonido de la ruleta:', e);
  }
}

function playTick() {
  playTone(900, 0.05, 'square', 0.08);
}

function playWinSound() {
  playTone(660, 0.18, 'sine', 0.18);
  setTimeout(() => playTone(880, 0.25, 'sine', 0.18), 120);
}

// Sonido más dramático para el premio mayor, acompaña el flash/glitch visual.
function playGrandPrizeSound() {
  const notes = [440, 554, 659, 880, 1108];
  notes.forEach((f, i) => setTimeout(() => playTone(f, 0.15, 'square', 0.15), i * 70));
  setTimeout(() => playTone(1320, 0.4, 'sawtooth', 0.12), notes.length * 70);
}

/* =============================================
   Giro de la rueda
   ============================================= */
function easeOutQuart(t) {
  return 1 - Math.pow(1 - t, 4);
}

function animateSpin(fromDeg, toDeg, winner, sliceAngle) {
  isSpinning = true;
  spinBtn.disabled = true;

  const duration = 4500 + Math.random() * 500; // 4.5–5s
  const start = performance.now();
  let lastTickSlice = Math.floor((((360 - (fromDeg % 360)) % 360) + 360) % 360 / sliceAngle);

  function frame(now) {
    const elapsed = now - start;
    const t = Math.min(elapsed / duration, 1);
    const eased = easeOutQuart(t);
    const current = fromDeg + (toDeg - fromDeg) * eased;
    canvas.style.transform = `rotate(${current}deg)`;

    // Ángulo (en el espacio de la rueda) que está actualmente bajo el puntero fijo
    const angleAtPointer = (((360 - (current % 360)) % 360) + 360) % 360;
    const sliceIndexNow = Math.floor(angleAtPointer / sliceAngle);
    if (sliceIndexNow !== lastTickSlice) {
      lastTickSlice = sliceIndexNow;
      playTick();
    }

    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      currentRotation = toDeg; // base para encadenar el siguiente giro
      isSpinning = false;
      spinBtn.disabled = false;
      onSpinComplete(winner);
    }
  }

  requestAnimationFrame(frame);
}

function spin() {
  if (isSpinning) return;

  getAudioCtx(); // se crea/retoma en el gesto del usuario, por las políticas de autoplay

  const prizes = getAvailablePrizes();
  const total = prizes.length;
  const sliceAngle = 360 / total;
  const winner = pickWeightedPrize(prizes);
  const winnerIndex = prizes.indexOf(winner);

  // Ángulo objetivo dentro de la rebanada ganadora, con un pequeño offset
  // aleatorio (dentro de la rebanada) para que no caiga siempre justo al centro.
  const maxOffset = sliceAngle * 0.3;
  const offset = (Math.random() * 2 - 1) * maxOffset;
  const targetAngleInWheel = (winnerIndex + 0.5) * sliceAngle + offset;

  const targetMod = (((360 - targetAngleInWheel) % 360) + 360) % 360;
  const currentMod = ((currentRotation % 360) + 360) % 360;
  const forwardDelta = ((targetMod - currentMod) + 360) % 360;
  const fullSpins = 5 + Math.floor(Math.random() * 3); // varias vueltas completas extra
  const finalRotation = currentRotation + forwardDelta + fullSpins * 360;

  animateSpin(currentRotation, finalRotation, winner, sliceAngle);
}

function onSpinComplete(winner) {
  addLogEntry(winner.name);

  if (winner.isGrandPrize) {
    saveWonDate(getTodayStr());
    renderWheel(); // se redibuja sin la rebanada del premio mayor
  }

  showReveal(winner);
}

/* =============================================
   Overlay de resultado
   ============================================= */
function showReveal(winner) {
  revealPrizeEl.textContent = winner.name;
  revealOverlay.classList.toggle('is-grand-prize', !!winner.isGrandPrize);
  revealOverlay.classList.remove('hidden');

  if (winner.isGrandPrize) {
    playGrandPrizeSound();
  } else {
    playWinSound();
  }
}

function hideReveal() {
  revealOverlay.classList.add('hidden');
  revealOverlay.classList.remove('is-grand-prize');
}

/* =============================================
   Controles de administración
   ============================================= */
function renderSpinsCount() {
  spinsCountEl.textContent = String(loadLog().length);
}

function renderLog() {
  const log = loadLog();
  logTbody.innerHTML = '';
  logEmpty.classList.toggle('hidden', log.length > 0);

  log.forEach((entry) => {
    const tr = document.createElement('tr');
    const date = new Date(entry.time).toLocaleString('es-MX');
    tr.innerHTML = `<td>${date}</td><td>${escapeHtml(entry.prize)}</td>`;
    logTbody.appendChild(tr);
  });
}

function renderMuteBtn() {
  muteBtn.textContent = isMuted() ? '🔇 Sonido silenciado' : '🔊 Sonido activado';
}

/* =============================================
   Modo pantalla completa (para el cliente)
   ============================================= */
let longPressTimer = null;

function enterFullscreen() {
  fsSlot.appendChild(wheelWrap);
  fsSlot.appendChild(spinControls);
  fsOverlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden'; // bloquea el scroll de la página

  // Mejora opcional con la Fullscreen API real; si el navegador no la soporta
  // (p. ej. iOS Safari), el overlay de pantalla completa por CSS ya cumple el objetivo.
  if (fsOverlay.requestFullscreen) {
    fsOverlay.requestFullscreen().catch(() => {});
  }
}

function exitFullscreen() {
  normalSlot.appendChild(wheelWrap);
  normalSlot.appendChild(spinControls);
  fsOverlay.classList.add('hidden');
  document.body.style.overflow = '';

  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
}

function startLongPress() {
  longPressTimer = setTimeout(exitFullscreen, 2000);
}

function cancelLongPress() {
  clearTimeout(longPressTimer);
}

/* =============================================
   Listeners
   ============================================= */
spinBtn.addEventListener('click', spin);
revealNextBtn.addEventListener('click', hideReveal);

muteBtn.addEventListener('click', () => {
  setMuted(!isMuted());
  renderMuteBtn();
});

fullscreenBtn.addEventListener('click', enterFullscreen);

// Pulsación larga (2s) sobre el logo para salir del modo pantalla completa.
fsLogo.addEventListener('pointerdown', startLongPress);
fsLogo.addEventListener('pointerup', cancelLongPress);
fsLogo.addEventListener('pointerleave', cancelLongPress);
fsLogo.addEventListener('pointercancel', cancelLongPress);

// Evita el scroll de rebote mientras está activo el modo pantalla completa.
fsOverlay.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

resetBtn.addEventListener('click', () => {
  saveWonDate(null);
  renderWheel();
  resetMsg.textContent = 'Premio mayor restaurado ✓';
  resetMsg.classList.add('is-ok');
  setTimeout(() => { resetMsg.textContent = ''; }, 2000);
});

clearHistoryBtn.addEventListener('click', () => {
  if (!confirm('¿Borrar todo el historial de la ruleta? Esta acción no se puede deshacer.')) return;
  saveLog([]);
  renderLog();
  renderSpinsCount();
});

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    setupCanvasResolution();
    renderWheel();
  }, 150);
});

/* =============================================
   Inicialización
   ============================================= */
setupCanvasResolution();
renderWheel();
renderLog();
renderSpinsCount();
renderMuteBtn();
