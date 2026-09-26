import { execFileSync } from 'node:child_process';
import { renameSync } from 'node:fs';
import { renderVideo } from '@revideo/renderer';

const targets: Record<
  string,
  { projectFile: string; outFile: `${string}.mp4`; audioFadeOut?: number; audioDelayMs?: number }
> = {
  'intro': { projectFile: './src/project.tsx', outFile: 'kansoku-product-intro.mp4' },
  'full': {
    projectFile: './src/full-intro.tsx',
    outFile: 'kansoku-full-intro.mp4',
    audioFadeOut: 1.2,
  },
  'teaser': {
    projectFile: './src/teaser.tsx',
    outFile: 'kansoku-teaser.mp4',
    audioFadeOut: 1.2,
    // Revideo muxes audio one frame ahead of the video; the teaser's cuts are frame-locked to the beat.
    audioDelayMs: 1000 / 30,
  },
  'whats-new': {
    projectFile: './src/whats-new.tsx',
    outFile: 'kansoku-whats-new-0.43.mp4',
    audioFadeOut: 1.2,
  },
};

function finishAudio(file: string, seconds: number, delayMs = 0) {
  const duration = Number(
    execFileSync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'csv=p=0',
      file,
    ])
      .toString()
      .trim(),
  );
  const tmp = file.replace(/\.mp4$/, '.fade.mp4');
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-i',
    file,
    '-c:v',
    'copy',
    '-af',
    [
      delayMs > 0 && `adelay=${delayMs.toFixed(3)}:all=1`,
      `afade=t=out:st=${duration - seconds}:d=${seconds}`,
    ]
      .filter(Boolean)
      .join(','),
    ...(delayMs > 0 ? ['-shortest'] : []),
    '-c:a',
    'aac',
    tmp,
  ]);
  renameSync(tmp, file);
}

async function main() {
  const name = process.argv[2] ?? 'intro';
  const target = targets[name];
  if (!target)
    throw new Error(`unknown target "${name}", expected: ${Object.keys(targets).join(', ')}`);
  const file = await renderVideo({
    projectFile: target.projectFile,
    settings: {
      logProgress: true,
      outDir: './output',
      outFile: target.outFile,
    },
  });
  if (target.audioFadeOut) finishAudio(file, target.audioFadeOut, target.audioDelayMs);
}

void main();
