import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const SR = 44100;

export const CHORDS = {
  Am: { notes: [57, 60, 64, 67], root: 45 },
  F: { notes: [53, 57, 60, 64], root: 41 },
  C: { notes: [52, 55, 60, 62], root: 48 },
  G: { notes: [55, 59, 62, 64], root: 43 },
};

export function createSynth({ length, seed }) {
  const N = Math.ceil(length * SR);
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 31 - 1;
  };
  const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
  const coef = (cutoff) => 1 - Math.exp((-2 * Math.PI * cutoff) / SR);

  const bus = () => ({ l: new Float32Array(N), r: new Float32Array(N) });
  const music = bus();
  const drums = bus();
  const arpBus = bus();
  const kicks = [];

  function add(target, t0, dur, fn, pan = 0) {
    const start = Math.floor(t0 * SR);
    const gl = Math.cos(((pan + 1) * Math.PI) / 4);
    const gr = Math.sin(((pan + 1) * Math.PI) / 4);
    for (let i = 0; i < Math.floor(dur * SR); i++) {
      const at = start + i;
      if (at < 0 || at >= N) continue;
      const v = fn(i / SR);
      target.l[at] += v * gl;
      target.r[at] += v * gr;
    }
  }

  function pad(t0, dur, notes, level, cutoff) {
    for (const note of notes) {
      for (const detune of [-0.08, 0.08]) {
        const f = hz(note) * 2 ** (detune / 12);
        const a = coef(cutoff);
        let phase = rand() * 0.5 + 0.5;
        let low = 0;
        add(
          music,
          t0,
          dur + 1.6,
          (t) => {
            phase = (phase + f / SR) % 1;
            low += a * (2 * phase - 1 - low);
            const env = Math.min(1, t / 1.1) * (t > dur ? Math.exp(-(t - dur) * 3) : 1);
            return low * env * level * 0.07;
          },
          detune < 0 ? -0.55 : 0.55,
        );
      }
    }
  }

  function kick(t0, level = 1) {
    let phase = 0;
    kicks.push(t0);
    add(drums, t0, 0.5, (t) => {
      phase += (46 + 120 * Math.exp(-t * 30)) / SR;
      const click = t < 0.003 ? rand() * 0.4 : 0;
      return (Math.sin(2 * Math.PI * phase) * Math.exp(-t * 7) + click) * level * 0.85;
    });
  }

  function hat(t0, level = 1, pan = 0.25) {
    let previous = 0;
    add(
      drums,
      t0,
      0.08,
      (t) => {
        const n = rand();
        const high = n - previous;
        previous = n;
        return high * Math.exp(-t * 65) * level * 0.16;
      },
      pan,
    );
  }

  function clap(t0, level = 1) {
    let low = 0;
    let previous = 0;
    const a = coef(2600);
    add(drums, t0, 0.3, (t) => {
      const n = rand();
      low += a * (n - previous - low);
      previous = n;
      const burst = t < 0.03 ? 1 - ((t * 100) % 1) * 0.5 : 1;
      return (
        (low * 1.6 * burst + Math.sin(2 * Math.PI * 190 * t) * 0.3) * Math.exp(-t * 16) * level * 0.4
      );
    });
  }

  function bass(t0, root, level = 1) {
    const f = hz(root);
    const a = coef(420);
    let phase = 0;
    let low = 0;
    add(music, t0, 0.42, (t) => {
      phase = (phase + f / SR) % 1;
      low += a * (2 * phase - 1 - low);
      return (low * 0.7 + Math.sin(2 * Math.PI * phase) * 0.6) * Math.exp(-t * 5) * level * 0.32;
    });
  }

  function pluck(t0, note, level = 1, pan = 0) {
    const f = hz(note);
    let phase = rand() * 0.5 + 0.5;
    add(
      arpBus,
      t0,
      0.5,
      (t) => {
        phase = (phase + f / SR) % 1;
        const tri = 1 - 4 * Math.abs(phase - 0.5);
        return tri * Math.exp(-t * 11) * level * 0.09;
      },
      pan,
    );
  }

  function riser(t1, dur = 1.2, level = 1) {
    let low = 0;
    add(
      drums,
      t1 - dur,
      dur,
      (t) => {
        const p = t / dur;
        low += coef(250 + 8500 * p * p) * (rand() - low);
        return low * p * p * level * 0.35;
      },
      0,
    );
  }

  function impact(t0, level = 1) {
    kick(t0, 1.15 * level);
    let low = 0;
    const a = coef(900);
    add(drums, t0, 1.8, (t) => {
      low += a * (rand() - low);
      return (
        (low * Math.exp(-t * 2.4) * 0.9 + Math.sin(2 * Math.PI * 38 * t) * Math.exp(-t * 1.6) * 0.5) *
        level
      );
    });
  }

  function render(out, { mute = [] } = {}) {
    const delay = Math.floor(0.375 * SR);
    for (let i = delay; i < N; i++) {
      arpBus.l[i] += arpBus.r[i - delay] * 0.38;
      arpBus.r[i] += arpBus.l[i - delay] * 0.38;
    }

    const duck = new Float32Array(N).fill(1);
    for (const t0 of kicks) {
      const start = Math.floor(t0 * SR);
      for (let i = 0; i < 0.35 * SR && start + i < N; i++) {
        duck[start + i] = Math.min(duck[start + i], 1 - 0.55 * Math.exp(-(i / SR) * 9));
      }
    }

    const gate = new Float32Array(N).fill(1);
    const ramp = 0.005 * SR;
    for (const [t0, t1] of mute) {
      for (let i = Math.floor(t0 * SR - ramp); i < t1 * SR + ramp && i < N; i++) {
        if (i < 0) continue;
        const edge = Math.min(t0 * SR - i, i - t1 * SR);
        gate[i] = Math.min(gate[i], edge > 0 ? Math.min(1, edge / ramp) : 0);
      }
    }

    const mixL = new Float32Array(N);
    const mixR = new Float32Array(N);
    let peak = 0;
    for (let i = 0; i < N; i++) {
      const fade = Math.min(1, (length - 0.3 - i / SR) / 2.5);
      const g = mute.length ? gate[i] : 1;
      const l =
        g * Math.tanh((drums.l[i] + (music.l[i] + arpBus.l[i]) * duck[i]) * 1.1) * Math.max(0, fade);
      const r =
        g * Math.tanh((drums.r[i] + (music.r[i] + arpBus.r[i]) * duck[i]) * 1.1) * Math.max(0, fade);
      mixL[i] = l;
      mixR[i] = r;
      peak = Math.max(peak, Math.abs(l), Math.abs(r));
    }

    const gain = 0.89 / peak;
    const pcm = Buffer.alloc(44 + N * 4);
    pcm.write('RIFF', 0);
    pcm.writeUInt32LE(36 + N * 4, 4);
    pcm.write('WAVEfmt ', 8);
    pcm.writeUInt32LE(16, 16);
    pcm.writeUInt16LE(1, 20);
    pcm.writeUInt16LE(2, 22);
    pcm.writeUInt32LE(SR, 24);
    pcm.writeUInt32LE(SR * 4, 28);
    pcm.writeUInt16LE(4, 32);
    pcm.writeUInt16LE(16, 34);
    pcm.write('data', 36);
    pcm.writeUInt32LE(N * 4, 40);
    for (let i = 0; i < N; i++) {
      pcm.writeInt16LE(Math.round(mixL[i] * gain * 32767), 44 + i * 4);
      pcm.writeInt16LE(Math.round(mixR[i] * gain * 32767), 46 + i * 4);
    }

    if (process.env.BGM_WAV) writeFileSync(process.env.BGM_WAV, pcm);
    const dir = mkdtempSync(join(tmpdir(), 'kansoku-bgm-'));
    const wav = join(dir, 'bgm.wav');
    writeFileSync(wav, pcm);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-b:a', '192k', out]);
    rmSync(dir, { recursive: true, force: true });
    console.log(`wrote ${out} (${length}s, peak gain ${gain.toFixed(2)})`);
  }

  return { add, bass, clap, coef, hat, hz, impact, kick, pad, pluck, rand, riser, render };
}
