import type { GameSound } from "@/lib/games/types";
import { siteStorage } from "@/lib/storage";
import { worldEngine } from "@/lib/worlds/engine";

/** Tiny WebAudio synth shared by every game. Each world gives it a different voice. */
type Listener = (on: boolean) => void;
const listeners = new Set<Listener>();
let ctx: AudioContext | null = null;
let on: boolean | null = null;

const WAVE: Record<string, OscillatorType> = { abyss: "sine", core: "sawtooth", collage: "triangle", orbit: "square" };

function isOn() {
  if (on === null) on = siteStorage.get("sound", true);
  return on;
}
function audio(): AudioContext | null {
  if (!isOn() || typeof window === "undefined") return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}
function tone(f: number, t0: number, dur: number, type: OscillatorType = "sine", vol = 0.1) {
  const c = audio(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, c.currentTime + t0);
  g.gain.setValueAtTime(0.0001, c.currentTime + t0);
  g.gain.exponentialRampToValueAtTime(vol, c.currentTime + t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t0 + dur);
  o.connect(g); g.connect(c.destination);
  o.start(c.currentTime + t0); o.stop(c.currentTime + t0 + dur + 0.05);
  if (worldEngine.current() === "abyss") { // underwater echo
    const d = c.createDelay(); d.delayTime.value = 0.18; const fb = c.createGain(); fb.gain.value = 0.35;
    g.connect(d); d.connect(fb); fb.connect(d); d.connect(c.destination);
  }
}
function noise(dur: number, vol: number, freq: number) {
  const c = audio(); if (!c) return;
  const n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / n);
  const s = c.createBufferSource(); s.buffer = b;
  const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = 0.6;
  const g = c.createGain(); g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(c.destination); s.start();
}

export const sound: GameSound & { setEnabled(v: boolean): void; subscribe(fn: Listener): () => void } = {
  unlock: () => { audio(); },
  enabled: isOn,
  setEnabled(v) { on = v; siteStorage.set("sound", v); listeners.forEach((fn) => fn(v)); },
  subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  tone,
  reward(t) {
    const notes = [392, 494, 587, 659, 784, 988, 1175], w = WAVE[worldEngine.current()] || "sine";
    for (let i = 0; i < t + 2; i++) tone(notes[i], i * 0.075, 0.22 + (i === t + 1 ? 0.3 : 0), w, 0.09);
    if (t >= 3) {
      if (worldEngine.current() === "orbit") { noise(1.4, 0.5, 600); tone(233, 0, 0.6, "sawtooth", 0.05); }
      else tone(notes[t + 1] * 2, (t + 2) * 0.075, 0.5, "sine", 0.06);
    }
  },
  miss() { tone(180, 0, 0.18, "sawtooth", 0.07); tone(120, 0.12, 0.3, "sawtooth", 0.07); },
  tick() { tone(1400, 0, 0.04, "square", 0.03); },
  click() { tone(660, 0, 0.06, WAVE[worldEngine.current()] || "sine", 0.05); },
};
