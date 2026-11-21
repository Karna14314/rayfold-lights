const MUTE_KEY = 'rayfold:muted';

let audioContext: AudioContext | null = null;
let masterGain: GainNode | null = null;
let muted = readMuted();

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMuted(value: boolean): void {
  try {
    window.localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    // Storage is optional; the in-memory preference still works.
  }
}

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  if (!audioContext) {
    try {
      const AudioCtor = window.AudioContext;
      if (!AudioCtor) return null;

      audioContext = new AudioCtor();
      masterGain = audioContext.createGain();
      masterGain.gain.value = 0.55;

      const compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.value = -20;
      compressor.knee.value = 18;
      compressor.ratio.value = 5;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.24;

      masterGain.connect(compressor);
      compressor.connect(audioContext.destination);
    } catch {
      audioContext = null;
      masterGain = null;
      return null;
    }
  }

  if (audioContext.state === 'suspended') {
    void audioContext.resume().catch(() => undefined);
  }

  return audioContext;
}

export function primeAudio(): void {
  getContext();
}

export function isMuted(): boolean {
  return muted;
}

export function toggleMute(): boolean {
  muted = !muted;
  writeMuted(muted);
  if (!muted) primeAudio();
  return muted;
}

export function playMirrorPlace(): void {
  if (muted) return;
  const ctx = getContext();
  if (!ctx || !masterGain) return;

  const start = ctx.currentTime + 0.005;
  tone(ctx, masterGain, 880, start, 0.17, 0.045, 'triangle');
  tone(ctx, masterGain, 1046.5, start + 0.006, 0.2, 0.032, 'sine');
  tone(ctx, masterGain, 1760, start + 0.002, 0.09, 0.018, 'sine');
}

export function playMirrorRemove(): void {
  if (muted) return;
  const ctx = getContext();
  if (!ctx || !masterGain) return;

  const start = ctx.currentTime + 0.004;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(320, start);
  osc.frequency.exponentialRampToValueAtTime(190, start + 0.09);

  filter.type = 'lowpass';
  filter.frequency.value = 780;
  filter.Q.value = 0.7;

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.05, start + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.11);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  osc.start(start);
  osc.stop(start + 0.13);
}

export function playTargetLit(count: 1 | 2 | 3): void {
  if (muted) return;
  const ctx = getContext();
  if (!ctx || !masterGain) return;

  const start = ctx.currentTime + 0.01;
  const notes = [523.25, 659.25, 783.99];

  for (let index = 0; index < count; index++) {
    const frequency = notes[index];
    if (!frequency) continue;
    tone(ctx, masterGain, frequency, start + index * 0.055, 0.38, 0.038, 'sine');
    tone(
      ctx,
      masterGain,
      frequency * 2,
      start + index * 0.055 + 0.006,
      0.2,
      0.012,
      'sine'
    );
  }
}

export function playSolved(beatPar: boolean): void {
  if (muted) return;
  const ctx = getContext();
  if (!ctx || !masterGain) return;

  const start = ctx.currentTime + 0.02;
  const chord = [261.63, 329.63, 392, 493.88, 587.33];

  for (let index = 0; index < chord.length; index++) {
    const frequency = chord[index];
    if (!frequency) continue;
    const when = start + index * 0.085;
    tone(ctx, masterGain, frequency, when, 0.75, 0.036, 'triangle');
    tone(ctx, masterGain, frequency * 2, when + 0.004, 0.38, 0.01, 'sine');
  }

  for (const frequency of chord) {
    tone(ctx, masterGain, frequency, start + 0.48, 1.15, 0.02, 'sine');
  }

  if (beatPar) {
    const sparkle = [1046.5, 1318.5, 1568];
    for (let index = 0; index < sparkle.length; index++) {
      const frequency = sparkle[index];
      if (!frequency) continue;
      tone(ctx, masterGain, frequency, start + 0.56 + index * 0.06, 0.5, 0.012, 'sine');
    }
  }
}

export function playBudgetShake(): void {
  if (muted) return;
  const ctx = getContext();
  if (!ctx || !masterGain) return;

  const start = ctx.currentTime + 0.005;
  for (const offset of [0, 0.12]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(offset === 0 ? 96 : 82, start + offset);

    filter.type = 'lowpass';
    filter.frequency.value = 220;

    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(0.06, start + offset + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.12);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    osc.start(start + offset);
    osc.stop(start + offset + 0.14);
  }
}

function tone(
  ctx: AudioContext,
  destination: AudioNode,
  frequency: number,
  start: number,
  duration: number,
  peak: number,
  type: OscillatorType
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(gain);
  gain.connect(destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}
