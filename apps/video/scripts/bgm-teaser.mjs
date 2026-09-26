import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BEAT, CUE, DROP_CUTS, FLASH_CUTS, sec } from '../src/teaser/cues.ts';
import { CHORDS, createSynth } from './synth.mjs';

const B = sec(BEAT);
const at = (frames) => sec(frames);
const LENGTH = sec(CUE.total);
const out = join(dirname(fileURLToPath(import.meta.url)), '../public/audio/teaser-bgm.mp3');
const { bass, clap, hat, impact, kick, pad, pluck, riser, render } = createSynth({
  length: LENGTH,
  seed: 20260927,
});

const LOOP = ['Am', 'F', 'C', 'G'];
const chordFrom = (origin, t) => CHORDS[LOOP[Math.floor((t - origin) / (4 * B)) % 4]];

pad(0, at(CUE.zoomOut), [33, 45, 52], 1.1, 260);
riser(at(CUE.pull), 0.45, 0.7);
impact(at(CUE.pull), 0.7);
for (let t = at(CUE.pull) + B; t < at(CUE.zoomOut); t += B) hat(t, 0.55, t % (2 * B) < B ? -0.3 : 0.3);
riser(at(CUE.slam), 0.5, 0.8);
impact(at(CUE.slam), 1.15);
clap(at(CUE.slam), 0.9);

for (let t = at(CUE.zoomOut); t < at(CUE.silence); t += 4 * B) {
  pad(t, Math.min(4 * B, at(CUE.silence) - t), chordFrom(at(CUE.zoomOut), t + 0.01).notes, 0.6, 1100);
}
for (let t = at(CUE.zoomOut); t < at(CUE.wall); t += B / 2) {
  const step = Math.round((t - at(CUE.zoomOut)) / (B / 2));
  if (step % 4 === 0) {
    kick(t, 0.7);
    bass(t, chordFrom(at(CUE.zoomOut), t).root, 0.8);
  }
  if (step % 2 === 1) hat(t, 0.5);
  if (t >= at(CUE.line)) {
    const notes = chordFrom(at(CUE.zoomOut), t).notes;
    pluck(t, notes[step % 4] + 12, step % 4 === 0 ? 0.9 : 0.6, step % 2 === 0 ? -0.35 : 0.35);
  }
}

riser(at(CUE.silence), at(CUE.silence) - at(CUE.wall), 1.25);
for (let t = at(CUE.wall); t < at(CUE.silence); ) {
  const left = at(CUE.silence) - t;
  const step = left > 3 * B ? B / 2 : left > B ? B / 4 : B / 8;
  hat(t, 0.4 + (1 - left / (7 * B)) * 0.7, Math.round(t / (B / 8)) % 2 ? 0.3 : -0.3);
  if (left <= 3 * B) clap(t, 0.2 + (1 - left / (3 * B)) * 0.6);
  if (left > 3 * B && Math.abs((t - at(CUE.wall)) % B) < 1e-6) kick(t, 0.85);
  t += step;
}

const dropOrigin = at(CUE.drop);
const cuts = new Set(DROP_CUTS.map((frames) => at(frames).toFixed(3)));
for (const [index, frames] of DROP_CUTS.entries()) impact(at(frames), index === 0 ? 1.3 : 0.75);
for (let t = dropOrigin; t < at(CUE.flash) - 1e-6; t += B / 4) {
  const step = Math.round((t - dropOrigin) / (B / 4));
  const chord = chordFrom(dropOrigin, t);
  if (step % 4 === 0 && !cuts.has(t.toFixed(3))) kick(t, 1);
  if (step % 4 === 2) hat(t, 0.9);
  if (step % 8 === 4) clap(t, 0.85);
  if (step % 2 === 0) bass(t, chord.root, step % 4 === 0 ? 0.8 : 1);
  pluck(t, chord.notes[[0, 2, 1, 3][step % 4]] + 12, step % 4 === 0 ? 0.95 : 0.65, step % 2 ? 0.4 : -0.4);
}
for (let t = dropOrigin; t < at(CUE.flash); t += 4 * B) pad(t, 4 * B, chordFrom(dropOrigin, t).notes, 0.5, 1800);

for (const [index, frames] of FLASH_CUTS.entries()) {
  const t = at(frames);
  kick(t, 0.8 + index * 0.04);
  clap(t, 0.4 + index * 0.07);
  bass(t, CHORDS.G.root, 1);
}
for (let t = at(CUE.flash); t < at(CUE.collapse); t += B / 4) hat(t, 0.8);
pad(at(CUE.flash), at(CUE.collapse) - at(CUE.flash), CHORDS.G.notes, 0.6, 2400);

impact(at(CUE.collapse), 0.6);
pad(at(CUE.collapse), at(CUE.merge) - at(CUE.collapse), [33, 45, 52, 57], 0.9, 420);
riser(at(CUE.merge), at(CUE.merge) - at(CUE.collapse), 1.3);
impact(at(CUE.merge), 1.45);

pad(at(CUE.merge), at(CUE.tagline) - at(CUE.merge), CHORDS.F.notes, 0.7, 1700);
pad(at(CUE.tagline), LENGTH - at(CUE.tagline) - 1.5, CHORDS.C.notes, 0.75, 2000);
for (let k = 0; k < 16; k++) {
  const t = at(CUE.end) + k * (B / 2);
  const chord = t < at(CUE.tagline) ? CHORDS.F : CHORDS.C;
  pluck(t, chord.notes[k % 4] + 12, 1 - k / 20, k % 2 === 0 ? -0.4 : 0.4);
}
for (const note of [60, 64, 67, 72]) pluck(at(CUE.tagline), note + 12, 1.2, 0);
kick(at(CUE.tagline), 0.6);

render(out, { mute: [[at(CUE.silence), at(CUE.drop) - 0.006]] });
