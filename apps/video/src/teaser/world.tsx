import { Img, Layout, Line, Rect, Txt } from '@revideo/2d';
import {
  type ThreadGenerator,
  createRefArray,
  createSignal,
  easeInOutCubic,
  tween,
} from '@revideo/core';
import { C, mono } from '../components';
import { Candles, heroPoint } from './candles';

export const CARD = { w: 2000, h: 1250 };
const GAP = { x: 2160, y: 1410 };
const F = 1000;

export const CARDS = [
  { code: 'VERIFY', src: '/captures/full/verify-answer.webp' },
  { code: 'CHART', src: '/captures/full/chart-1d.webp' },
  { code: 'CHECK', src: '/captures/full/sepa.webp' },
  { code: 'SCENARIOS', src: '/captures/full/chart-1h.webp' },
  { code: 'CANVAS', src: '/captures/full/canvas-library.webp' },
  { code: 'WATCH', src: '/captures/full/watch.webp' },
  { code: 'RECORD', src: '/captures/full/memory.webp' },
  { code: 'TRAIN', src: '/captures/full/train/t00.webp' },
];
export const HERO_CARD = 1;

const grid = CARDS.map((_, index) => ({
  x: ((index % 4) - 1.5) * GAP.x,
  y: (Math.floor(index / 4) - 0.5) * GAP.y,
}));
const wall = CARDS.map((_, index) => ({ x: index * 800, y: index % 2 ? 90 : -90, z: 1600 + index * 1000 }));
export const WALL_END = wall[wall.length - 1].z + 260;

export const heroWorld = {
  x: grid[HERO_CARD].x + heroPoint.x,
  y: grid[HERO_CARD].y + heroPoint.y,
};
export const chartWorld = { x: grid[HERO_CARD].x - 290, y: grid[HERO_CARD].y - 100 };

const STREAKS = Array.from({ length: 36 }, (_, index) => {
  const r = (n: number) => ((Math.sin(index * 91.7 + n * 13.3) + 1) / 2) % 1;
  return { x: -2400 + r(1) * 9000, y: (r(2) - 0.5) * 2600, z: 400 + r(3) * 9000, len: 300 + r(4) * 700 };
});

export function createWorld() {
  const scale = createSignal(1);
  const fx = createSignal(0);
  const fy = createSignal(0);
  const camZ = createSignal(0);
  const blend = createSignal(0);
  const others = createSignal(0);
  const glow = createSignal(28);
  const trail = createSignal(0);
  const shot = createSignal(0);
  const frame = createSignal(0);
  const pops = CARDS.map((_, index) => createSignal(index === HERO_CARD ? 1 : 0));
  const labels = createRefArray<Txt>();

  const camX = () => camZ() * 0.8 + 700;
  const depth = (index: number) => wall[index].z - camZ();
  const lerp = (a: number, b: number) => a + (b - a) * blend();

  const gridX = (index: number) => (grid[index].x - fx()) * scale();
  const gridY = (index: number) => (grid[index].y - fy()) * scale();
  const wallScale = (index: number) => (0.64 * F) / Math.max(depth(index), 1);
  const wallX = (index: number) => (wall[index].x - camX()) * (F / Math.max(depth(index), 1));
  const wallY = (index: number) => wall[index].y * (F / Math.max(depth(index), 1));
  const fade = (index: number) => (blend() > 0 ? Math.min(1, Math.max(0, (depth(index) - 140) / 260)) : 1);

  const project = (p: { x: number; y: number; z: number }) => {
    const d = Math.max(p.z - camZ(), 1);
    return [(p.x - camX()) * (F / d), p.y * (F / d)] as [number, number];
  };

  const node = (
    <Layout>
      {STREAKS.map((streak, index) => (
        <Line
          key={`streak${index}`}
          points={() => [project(streak), project({ ...streak, z: streak.z + streak.len })]}
          stroke={index % 5 === 0 ? C.yellow : C.paper}
          lineWidth={2}
          opacity={() => (streak.z - camZ() > 60 ? blend() * 0.5 : 0)}
        />
      ))}
      {CARDS.map((card, index) => (
        <Layout
          key={`card${index}`}
          x={() => lerp(gridX(index), wallX(index))}
          y={() => lerp(gridY(index), wallY(index))}
          scale={() => lerp(scale(), wallScale(index)) * (0.7 + 0.3 * pops[index]())}
          opacity={() => pops[index]() * fade(index)}
          zIndex={() => (blend() > 0 ? -depth(index) : index === HERO_CARD ? 1 : 0)}
        >
          <Rect
            width={CARD.w}
            height={CARD.h}
            radius={26}
            clip
            fill={'#0B0D10'}
            stroke={() => (index === HERO_CARD ? `rgba(48,53,58,${frame()})` : C.border)}
            lineWidth={4}
          >
            <Img
              src={card.src}
              width={CARD.w}
              opacity={index === HERO_CARD ? shot : 1}
            />
            {index === HERO_CARD ? (
              <Layout opacity={() => 1 - shot()}>
                <Candles others={others} glow={glow} trail={trail} />
              </Layout>
            ) : null}
          </Rect>
          <Txt
            ref={labels}
            x={-CARD.w / 2}
            y={-CARD.h / 2 - 110}
            offset={[-1, 0]}
            text={card.code}
            fontFamily={mono}
            fontSize={120}
            fontWeight={800}
            letterSpacing={18}
            fill={C.yellow}
            opacity={() => Math.max(0, blend() * 2 - 1)}
          />
        </Layout>
      ))}
    </Layout>
  );

  function* camTo(
    toScale: number,
    to: { x: number; y: number },
    duration: number,
    ease: (value: number) => number,
  ): ThreadGenerator {
    const s0 = scale();
    const from = { x: fx(), y: fy() };
    yield* tween(duration, (value) => {
      const e = ease(value);
      const s = Math.exp(Math.log(s0) + (Math.log(toScale) - Math.log(s0)) * e);
      const u = s0 === toScale ? e : (1 / s - 1 / s0) / (1 / toScale - 1 / s0);
      scale(s);
      fx(from.x + (to.x - from.x) * u);
      fy(from.y + (to.y - from.y) * u);
    });
  }

  function* toWall(duration: number): ThreadGenerator {
    yield* blend(1, duration, easeInOutCubic);
  }

  return { node, scale, fx, fy, camZ, blend, others, glow, trail, shot, frame, pops, camTo, toWall };
}

export type World = ReturnType<typeof createWorld>;
