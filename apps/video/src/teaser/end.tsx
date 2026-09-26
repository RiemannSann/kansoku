import { Circle, Layout, Line, QuadBezier, Rect, Txt } from '@revideo/2d';
import {
  type ThreadGenerator,
  all,
  createRef,
  createRefArray,
  delay,
  easeInOutCubic,
  easeOutBack,
  easeOutExpo,
  waitFor,
} from '@revideo/core';
import { C, font, mono } from '../components';
import { RevealText, rise } from '../motion';
import type { createCollapse } from './collapse';
import { CUE, cueTime } from './cues';

const K = 190 / 824;
const LOGO_Y = -190;
const p = (x: number, y: number): [number, number] => [(x - 512) * K, (y - 512) * K];
const STROKE = 44 * K;

export function createEnd(collapse: ReturnType<typeof createCollapse>) {
  const logo = createRef<Layout>();
  const tile = createRef<Rect>();
  const middle = createRef<QuadBezier>();
  const sides = createRefArray<QuadBezier>();
  const dot = createRef<Circle>();
  const word = createRefArray<Txt>();
  const tagline = createRefArray<Txt>();
  const rule = createRef<Line>();
  const url = createRef<Txt>();

  const node = (
    <>
      <Layout ref={logo} y={LOGO_Y}>
        <Rect ref={tile} size={190} radius={44} fill={'#0A0E13'} stroke={C.border} lineWidth={2} scale={0} />
        <QuadBezier ref={sides} p0={p(230, 362)} p1={p(469, 258)} p2={p(792, 395)} stroke={'#525862'} lineWidth={STROKE} lineCap={'round'} end={0} opacity={0} />
        <QuadBezier ref={middle} p0={p(230, 510)} p1={p(489, 435)} p2={p(792, 512)} stroke={'#FACC15'} lineWidth={STROKE} lineCap={'round'} opacity={0} />
        <QuadBezier ref={sides} p0={p(230, 658)} p1={p(429, 796)} p2={p(792, 610)} stroke={'#525862'} lineWidth={STROKE} lineCap={'round'} end={0} opacity={0} />
        <Circle ref={dot} position={p(637, 495)} size={100 * K} fill={'#FEF08A'} scale={0} />
      </Layout>
      <Layout y={30}>
        <RevealText items={word} text={'KANSOKU'} perChar gap={16} align={'center'} fontSize={76} fontFamily={mono} fontWeight={800} fill={C.paper} />
      </Layout>
      <Layout y={132}>
        <RevealText items={tagline} text={'不是替你下单。是让每个判断都有依据。'} align={'center'} fontSize={44} fontFamily={font} fontWeight={700} fill={C.paper} />
      </Layout>
      <Line ref={rule} y={210} points={[[-220, 0], [220, 0]]} stroke={C.yellow} lineWidth={2} start={0.5} end={0.5} />
      <Txt ref={url} y={262} text={''} fontFamily={mono} fontSize={30} letterSpacing={5} fill={C.yellow} />
    </>
  );

  function* morph(): ThreadGenerator {
    const candle = collapse.candle();
    const body = collapse.body();
    const length = (792 - 230) * K;
    yield* all(
      candle.y(LOGO_Y, 0.6, easeInOutCubic),
      candle.rotation(90, 0.6, easeInOutCubic),
      body.height(length, 0.6, easeInOutCubic),
      body.width(STROKE, 0.6, easeInOutCubic),
      body.radius(STROKE / 2, 0.6),
      body.shadowBlur(0, 0.6),
      collapse.wicks().opacity(0, 0.25),
      delay(0.35, tile().scale(1, 0.5, easeOutBack)),
    );
    middle().opacity(1);
    candle.opacity(0);
    sides.forEach((side) => side.opacity(1));
    yield* all(
      ...[...sides].map((side) => side.end(1, 0.45, easeOutExpo)),
      delay(0.25, dot().scale(1, 0.45, easeOutBack)),
      delay(0.3, rise(word, 0.05)),
    );
  }

  function* play(): ThreadGenerator {
    yield* all(
      morph(),
      delay(
        cueTime(CUE.tagline - CUE.end),
        all(
          rise(tagline, 0.03),
          delay(0.5, all(rule().start(0, 0.5, easeInOutCubic), rule().end(1, 0.5, easeInOutCubic))),
          delay(1, url().text('kansoku.trade', 0.5)),
        ),
      ),
      waitFor(cueTime(CUE.total - CUE.end)),
    );
  }

  return { node, play, logo };
}
