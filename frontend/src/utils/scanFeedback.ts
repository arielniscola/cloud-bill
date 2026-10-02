/**
 * Feedback sonoro de los lectores de código de barras (formularios y mostrador).
 */

// Web Audio API beep: corto agudo en éxito, doble grave en error.
// Se crea/recrea el AudioContext bajo demanda; algunos browsers exigen gesto del usuario,
// pero un scan termina en "Enter" que cuenta como interacción.
let sharedAudioCtx: AudioContext | null = null;
const getAudioCtx = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  if (sharedAudioCtx) return sharedAudioCtx;
  const Ctor = window.AudioContext
    || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    sharedAudioCtx = new Ctor();
    return sharedAudioCtx;
  } catch {
    return null;
  }
};

const beep = (freq: number, durationMs: number, when = 0) => {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const start = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.15, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + durationMs / 1000);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + durationMs / 1000 + 0.02);
};

/** Beep corto y agudo: producto encontrado y agregado. */
export const playScanSuccess = () => beep(880, 80);
/** Doble beep grave: código no encontrado. */
export const playScanError = () => {
  beep(220, 120, 0);
  beep(220, 120, 0.15);
};
