import { Gradient, Layout, Rect, Txt } from '@revideo/2d';
import {
  type SimpleSignal,
  type ThreadGenerator,
  all,
  createRefArray,
  createSignal,
  delay,
  easeOutExpo,
  linear,
  waitFor,
} from '@revideo/core';
import { C, font } from '../components';
import { BEAT, DROP_BEATS, FLASH_FRAMES, cueTime } from './cues';
import { SplitText, shake, slamIn } from './fx';
import { buildShots } from './shots';

const SHADE = '#080A0C';

function shade(side: 'left' | 'right') {
  const from: [number, number] = side === 'left' ? [-960, 0] : [960, 0];
  const to: [number, number] = side === 'left' ? [960, 0] : [-960, 0];
  return new Gradient({
    from,
    to,
    stops: [
      { offset: 0, color: `${SHADE}F2` },
      { offset: 0.3, color: `${SHADE}D0` },
      { offset: 0.58, color: `${SHADE}00` },
    ],
  });
}

export function createDrop() {
  const shots = buildShots();
  const frames = createRefArray<Layout>();
  const media = createRefArray<Layout>();
  const words = createRefArray<Layout>();
  const subs = createRefArray<Txt>();
  const texts = createRefArray<Layout>();
  const splits: SimpleSignal<number>[] = shots.map(() => createSignal(0));
  const flash = createRefArray<Rect>();

  const node = (
    <Layout>
      {shots.map((shot, index) => {
        const x = shot.side === 'left' ? -620 : 620;
        return (
          <Layout key={`shot${index}`} ref={frames} opacity={0}>
            <Layout ref={media}>{shot.media}</Layout>
            <Layout ref={texts}>
              <Rect width={1920} height={1080} fill={shade(shot.side)} />
              <Layout ref={words} x={x} y={-50} opacity={0}>
                <SplitText text={shot.word} split={splits[index]} fontSize={240} />
              </Layout>
              <Txt
                ref={subs}
                x={x}
                y={130}
                text={shot.sub}
                fontFamily={font}
                fontSize={46}
                fontWeight={700}
                fill={C.yellow}
                opacity={0}
              />
              {shot.over}
            </Layout>
          </Layout>
        );
      })}
      <Rect ref={flash} width={1920} height={1080} fill={'#FFFFFF'} opacity={0} />
    </Layout>
  );

  const show = (index: number) => frames.forEach((frame, k) => frame.opacity(k === index ? 1 : 0));

  function* cut(stage: Layout, index: number, duration: number): ThreadGenerator {
    show(index);
    flash[0].opacity(0.7);
    media[index].scale(1.14);
    subs[index].y(160);
    yield* all(
      flash[0].opacity(0, 0.1),
      media[index].scale(1, 0.45, easeOutExpo),
      delay(0.45, media[index].scale(0.965, duration - 0.45, linear)),
      slamIn(words[index], splits[index], 0.3),
      delay(0.12, all(subs[index].opacity(1, 0.2), subs[index].y(130, 0.4, easeOutExpo))),
      shake(stage, 16, 0.22),
      shots[index].animate(duration),
      waitFor(duration),
    );
  }

  function* play(stage: Layout): ThreadGenerator {
    for (const [index, beats] of DROP_BEATS.entries()) yield* cut(stage, index, cueTime(beats * BEAT));
  }

  function* flashback(): ThreadGenerator {
    texts.forEach((text) => text.opacity(0));
    for (const [k, frames_] of FLASH_FRAMES.entries()) {
      const index = shots.length - 1 - k;
      const duration = cueTime(frames_);
      show(index);
      flash[0].opacity(0.4);
      media[index].scale(1.1);
      yield* all(flash[0].opacity(0, Math.min(0.1, duration)), media[index].scale(1, duration, linear));
    }
    show(-1);
  }

  return { node, play, flashback };
}
