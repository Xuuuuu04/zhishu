// ─── In-app notification sound ───────────────────────────────────────────────
//
// Uses the Web Audio API to synthesize a short, pleasant "ding-dong" chime
// entirely in-browser — no audio files to ship, no network requests, no lag.
//
// The sound is two quick sine tones (A5 → E6) with an exponential decay
// envelope, similar to macOS 'Glass' but softer.

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  return audioCtx;
}

/**
 * Play a short two-note chime to signal that an AI response has completed.
 * Safe to call rapidly — calls overlap without interference.
 */
export function playNotificationSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    // Some browsers auto-suspend AudioContext until a user gesture; try to resume.
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;

    // Two-note chime: first note slightly lower, second higher, short gap
    playTone(ctx, 880,  now,        0.16);  // A5
    playTone(ctx, 1318, now + 0.12, 0.22);  // E6
  } catch (e) {
    console.warn('playNotificationSound failed:', e);
  }
}

function playTone(ctx, freq, startTime, duration) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.value = freq;

  // ADSR-ish envelope — quick attack, exponential release (soft bell shape)
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(0.18, startTime + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  oscillator.connect(gain);
  gain.connect(ctx.destination);

  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.05);
}
