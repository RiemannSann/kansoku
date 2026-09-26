import { Img, Layout, Line, Rect } from '@revideo/2d';
import {
  type ThreadGenerator,
  all,
  createRef,
  createRefArray,
  createSignal,
  delay,
  easeInCubic,
  easeInOutSine,
  easeOutExpo,
  sequence,
} from '@revideo/core';
import { C } from '../components';
import { CUE, cueTime } from './cues';
import { shake } from './fx';
import { CARDS } from './world';

const RAYS = 20;

export function createCollapse() {
  const radius = createSignal(0);
  const spin = createSignal(0);
  const squeeze = createSignal(0);
  const cards = createRefArray<Layout>();
  const rays = createRefArray<Line>();
  const candle = createRef<Layout>();
  const body = createRef<Rect>();
  const wicks = createRef<Layout>();
  const flash = createRef<Rect>();

  const node = (
    <Layout>
      {Array.from({ length: RAYS }, (_, index) => {
        const angle = (index / RAYS) * Math.PI * 2;
        const far = index % 2 ? 1400 : 1000;
        return (
          <Line
            ref={rays}
            points={[
              [Math.cos(angle) * 60, Math.sin(angle) * 60],
              [Math.cos(angle) * far, Math.sin(angle) * far],
            ]}
            stroke={index % 4 === 0 ? C.yellow : C.border}
            lineWidth={index % 4 === 0 ? 3 : 2}
            end={0}
          />
        );
      })}
      {CARDS.map((card, index) => {
        const base = (index / CARDS.length) * Math.PI * 2;
        const angle = () => base + spin();
        return (
          <Layout
            ref={cards}
            x={() => Math.cos(angle()) * radius() * 1.55}
            y={() => Math.sin(angle()) * radius() * 0.8}
            rotation={() => (angle() * 180) / Math.PI + 90 * squeeze()}
            scale={0}
          >
            <Rect
              width={() => 420 * (1 - squeeze() * 0.95)}
              height={() => 262 + 140 * squeeze()}
              radius={12}
              clip
              stroke={C.border}
              lineWidth={2}
              fill={'#0B0D10'}
            >
              <Img src={card.src} width={420} />
            </Rect>
          </Layout>
        );
      })}
      <Layout ref={candle} scale={0}>
        <Layout ref={wicks}>
          <Line points={[[0, -230], [0, -120]]} stroke={C.yellow} lineWidth={6} lineCap={'round'} />
          <Line points={[[0, 120], [0, 200]]} stroke={C.yellow} lineWidth={6} lineCap={'round'} />
        </Layout>
        <Rect ref={body} width={44} height={240} radius={4} fill={C.yellow} shadowColor={C.yellow} shadowBlur={40} />
      </Layout>
      <Rect ref={flash} width={1920} height={1080} fill={'#FFFFFF'} opacity={0} />
    </Layout>
  );

  function* play(stage: Layout): ThreadGenerator {
    const suck = cueTime(CUE.merge - CUE.collapse) - 0.35;
    yield* all(
      sequence(0.03, ...[...cards].map((card) => card.scale(1, 0.35, easeOutExpo))),
      radius(360, 0.35, easeOutExpo),
      spin(Math.PI * 3.2, 0.35 + suck, easeInCubic),
      delay(0.35, all(radius(0, suck, easeInCubic), squeeze(1, suck, easeInCubic))),
      delay(0.35 + suck * 0.7, all(...[...cards].map((card) => card.opacity(0, suck * 0.3)))),
    );
    yield* merge(stage);
  }

  function* merge(stage: Layout): ThreadGenerator {
    candle().scale(1.5);
    flash().opacity(0.9);
    yield* all(
      candle().scale(1, 0.4, easeOutExpo),
      flash().opacity(0, 0.3),
      shake(stage, 34, 0.3),
      sequence(0.01, ...[...rays].map((ray) => ray.end(1, 0.5, easeOutExpo))),
      delay(0.45, sequence(0.01, ...[...rays].map((ray) => ray.start(1, 0.6, easeInCubic)))),
      body().shadowBlur(70, 0.8, easeInOutSine).to(30, cueTime(CUE.end - CUE.merge) - 0.8, easeInOutSine),
    );
  }

  return { node, candle, body, wicks, play };
}
