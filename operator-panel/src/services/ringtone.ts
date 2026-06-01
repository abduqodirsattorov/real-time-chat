// Module-level singleton — Web Audio API tone generator.
// No audio files needed; tones are synthesized via OscillatorNode.

let _ctx: AudioContext | null = null;
let _osc: OscillatorNode | null = null;
let _gain: GainNode | null = null;
let _timerId: ReturnType<typeof setTimeout> | null = null;
let _stopping = false;

function getCtx(): AudioContext | null {
  try {
    if (!_ctx || _ctx.state === 'closed') {
      _ctx = new AudioContext();
    }
    if (_ctx.state === 'suspended') {
      _ctx.resume().catch(() => {});
    }
    return _ctx;
  } catch {
    return null;
  }
}

function clearTimer() {
  if (_timerId !== null) {
    clearTimeout(_timerId);
    _timerId = null;
  }
}

function stopNode() {
  if (_osc) {
    try { _osc.stop(); } catch {}
    try { _osc.disconnect(); } catch {}
    _osc = null;
  }
  if (_gain) {
    try { _gain.disconnect(); } catch {}
    _gain = null;
  }
}

export function stopAll() {
  _stopping = true;
  clearTimer();
  stopNode();
}

// Play a sine tone for `durationMs`, then call onDone.
// Uses scheduled gain ramp to avoid audible clicks.
function tone(freq: number, gainVal: number, durationMs: number, onDone: () => void) {
  if (_stopping) return;
  const ctx = getCtx();
  if (!ctx) return;

  stopNode();

  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = freq;

    const t = ctx.currentTime;
    const dur = durationMs / 1000;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(gainVal, t + 0.010); // 10ms attack
    gain.gain.setValueAtTime(gainVal, t + dur - 0.010);
    gain.gain.linearRampToValueAtTime(0, t + dur);          // 10ms release

    osc.start(t);
    osc.stop(t + dur);
    _osc = osc;
    _gain = gain;

    osc.onended = () => {
      _osc = null;
      _gain = null;
      if (!_stopping) onDone();
    };
  } catch {}
}

// Wait `durationMs` ms, then call onDone.
function silence(durationMs: number, onDone: () => void) {
  if (_stopping) return;
  _timerId = setTimeout(() => {
    _timerId = null;
    if (!_stopping) onDone();
  }, durationMs);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Ringback — caller hears while waiting for the other party to answer.
 * European standard: 425 Hz, 1 s ON / 4 s OFF, loops until stopAll().
 */
export function startRingback() {
  stopAll();
  _stopping = false;

  const cycle = () => tone(425, 0.15, 1000, () => silence(4000, cycle));
  cycle();
}

/**
 * Ringtone — incoming call alert for the called party.
 * Double-ring pattern: 440 Hz + 480 Hz, 0.4 s each, short gap, 2 s pause.
 */
export function startRingtone() {
  stopAll();
  _stopping = false;

  const ring = () =>
    tone(440, 0.20, 400, () =>
      silence(80, () =>
        tone(480, 0.20, 400, () =>
          silence(80, () =>
            silence(2000, ring)
          )
        )
      )
    );

  ring();
}
