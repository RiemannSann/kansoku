import { Layout, Rect } from '@revideo/2d';
import {
  type ThreadGenerator,
  all,
  createRef,
  createRefArray,
  createSignal,
  delay,
  easeInCubic,
  easeInOutCubic,
  easeOutExpo,
  linear,
  sequence,
  waitFor,
} from '@revideo/core';
import type { Txt } from '@revideo/2d';
import { font, C } from '../components';
import { RevealText, rise, sink } from '../motion';
import { heroPoint } from './candles';
import { CUE, cueTime } from './cues';
import { SplitText, shake, slamIn } from './fx';
import { CARDS, HERO_CARD, type World, chartWorld, heroWorld } from './world';

const OVERVIEW = { scale: 0.19, focus: { x: 0, y: 380 } };

export function createHook(world: World, stage: () => Layout) {
  const S0 = 760 / heroPoint.h;
  const slam = createRef<Layout>();
  const split = createSignal(0);
  const dim = createRef<Rect>();
  const line = createRefArray<Txt>();

  const node = (
    <>
      <Rect ref={dim} width={1920} height={1080} fill={C.bg} opacity={0} />
      <Layout ref={slam} opacity={0}>
        <SplitText text={'别猜。'} split={split} fontSize={260} />
      </Layout>
      <Layout y={400}>
        <RevealText
          items={line}
          text={'每个判断，都摊开来看。'}
          align={'center'}
          fontSize={64}
          fontFamily={font}
          fontWeight={800}
          fill={C.paper}
        />
      </Layout>
    </>
  );

  const at = (frame: number, task: ThreadGenerator) => delay(cueTime(frame), task);

  function* play(): ThreadGenerator {
    world.scale(S0);
    world.fx(heroWorld.x);
    world.fy(heroWorld.y);
    world.glow(34);

    yield* all(
      world.camTo(S0 * 1.1, heroWorld, cueTime(CUE.pull), linear),
      at(
        CUE.pull,
        all(
          world.camTo(1.25, chartWorld, cueTime(CUE.slam - CUE.pull), easeOutExpo),
          world.others(1, 0.5),
          world.glow(10, 0.8),
          world.trail(1, 2, easeInOutCubic),
          shake(stage(), 22),
        ),
      ),
      at(
        CUE.slam,
        all(slamIn(slam(), split), dim().opacity(0.62, 0.2), world.camTo(1.4, chartWorld, cueTime(CUE.zoomOut - CUE.slam), linear), shake(stage(), 30)),
      ),
      at(
        CUE.slamOut,
        all(slam().scale([1.4, 0.05], 0.28, easeInCubic), slam().opacity(0, 0.28), dim().opacity(0, 0.4)),
      ),
      at(CUE.zoomOut, zoomOut()),
      at(CUE.line, rise(line, 0.035)),
      at(CUE.lineOut, sink(line, 90)),
      waitFor(cueTime(CUE.wall)),
    );
  }

  function* zoomOut(): ThreadGenerator {
    const others = CARDS.map((_, index) => index).filter((index) => index !== HERO_CARD);
    yield* all(
      world.camTo(OVERVIEW.scale, OVERVIEW.focus, 3.2, easeInOutCubic),
      world.frame(1, 0.6),
      delay(0.5, world.shot(1, 0.8)),
      delay(
        1.1,
        sequence(0.12, ...others.map((index) => world.pops[index](1, 0.7, easeOutExpo))),
      ),
    );
  }

  return { node, play };
}
