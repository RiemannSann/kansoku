import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHORDS, createSynth } from './synth.mjs';

const BEAT = 0.5;
const LENGTH = 87.6;
const SCENES = [0, 6.498, 16.632, 23.674, 30.828, 37.31, 45.45, 53.426, 62.376, 72.034, 78.13];
const FREEZE = 2.25;
const DECODE = 68.1;
const END = SCENES[10];
const RECORD = [SCENES[7], SCENES[8]];
const WATCH = [SCENES[6], SCENES[7]];

const out = join(dirname(fileURLToPath(import.meta.url)), '../public/audio/full-bgm.mp3');
const { bass, clap, hat, impact, kick, pad, pluck, riser, render } = createSynth({
  length: LENGTH,
  seed: 20260926,
});

const LOOP = ['Am', 'F', 'C', 'G'];
function chordAt(t) {
  if (t >= END + 4) return CHORDS.C;
  if (t >= END) return CHORDS.F;
  if (t < SCENES[1]) return CHORDS.Am;
  return CHORDS[LOOP[Math.floor((t - SCENES[1]) / 4) % 4]];
}

pad(0, FREEZE, CHORDS.Am.notes, 0.6, 700);
for (let t = 0; t < FREEZE; t += BEAT / 4) hat(t, 0.3 + (t / FREEZE) * 0.9, t % BEAT < BEAT / 2 ? -0.3 : 0.3);
riser(FREEZE, 1.6, 1.1);
impact(FREEZE, 1.1);
pad(FREEZE, SCENES[1] - FREEZE, [45, 52, 57], 0.9, 380);
for (let t = 3; t < SCENES[1] - 0.4; t += 1) {
  kick(t, 0.45);
  kick(t + 0.22, 0.3);
}

for (let t = SCENES[1]; t < END; t += 4) pad(t, 4, chordAt(t + 0.01).notes, 0.55, 1400);

for (let step = 0; ; step++) {
  const t = SCENES[1] + step * (BEAT / 2);
  if (t >= END) break;
  const onBeat = step % 2 === 0;
  const breakdown = t >= RECORD[0] && t < RECORD[1] - 3;
  const roll = t >= DECODE - 2.8 && t < DECODE;
  if (onBeat && !breakdown) kick(t, 0.95);
  if (!onBeat) hat(t, breakdown ? 0.5 : 0.9);
  if (t >= WATCH[0] && t < WATCH[1]) hat(t + BEAT / 4, 0.55, -0.3);
  if (onBeat && step % 4 === 2 && !breakdown) clap(t, 0.8);
  if (roll) {
    const density = t > DECODE - 1.2 ? 4 : 2;
    for (let k = 0; k < density; k++) clap(t + (k * BEAT) / (2 * density), 0.25 + (t - (DECODE - 2.8)) * 0.18);
  }
  if (!breakdown) bass(t, chordAt(t).root, onBeat ? 0.8 : 1);
}

for (let step = 0; ; step++) {
  const t = SCENES[2] + step * (BEAT / 4);
  if (t >= END) break;
  const notes = chordAt(t).notes;
  const pattern = [0, 1, 2, 3, 2, 1, 3, 2];
  const note = notes[pattern[step % pattern.length]] + 12;
  pluck(t, note, step % 4 === 0 ? 1.1 : 0.75, step % 2 === 0 ? -0.35 : 0.35);
}

for (const t of SCENES.slice(2)) {
  riser(t, 1.2, 0.9);
  impact(t, 0.9);
}
riser(DECODE, 1.4, 1);
impact(DECODE, 1);

pad(END, 4, CHORDS.F.notes, 0.7, 1800);
pad(END + 4, LENGTH - END - 5.5, CHORDS.C.notes, 0.75, 2000);
for (let k = 0; k < 16; k++) {
  const t = END + 1.3 + k * BEAT;
  pluck(t, chordAt(t).notes[k % 4] + 12, 1 - k / 18, k % 2 === 0 ? -0.4 : 0.4);
}
for (const note of [60, 64, 67, 72]) pluck(END + 1.3, note + 12, 1.3, 0);

render(out);
