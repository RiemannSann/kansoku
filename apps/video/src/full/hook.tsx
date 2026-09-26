import { Layout, Rect, Txt } from '@revideo/2d';
import {
  all,
  createRef,
  createRefArray,
  createSignal,
  easeInOutCubic,
  easeOutCubic,
  waitFor,
} from '@revideo/core';
import { C, font } from '../components';
import { RevealText, measure, rise, sink } from '../motion';
import type { Scene } from './chrome';
import { headlines, lockedHeadline } from './data';

const LAYERS = [
  { size: 24, alpha: 0.22, speed: 120, fill: C.dim },
  { size: 32, alpha: 0.42, speed: 220, fill: '#9AA4AC' },
  { size: 44, alpha: 0.8, speed: 360, fill: C.paper },
];
const ROW_LAYERS = [0, 2, 1, 0, 1, 2, -1, 1, 2, 0, 1, 2, 0];
const FREEZE = 2.3;
const LOCK_Y = -2;
const LOCK_LEFT = -620;

export const verifyBubble = { x: 36, y: -204, scale: 0.42 };

export function hookScene(): Scene {
  const clock = createSignal(0);
  const flow = createRefArray<Txt>();
  const lockGroup = createRef<Layout>();
  const lockText = createRef<Txt>();
  const lockBox = createRef<Rect>();
  const lineOne = createRefArray<Txt>();
  const lineTwo = createRefArray<Txt>();

  const alphas: number[] = [];
  let pick = 0;
  const rows = ROW_LAYERS.flatMap((layerIndex, row) => {
    if (layerIndex < 0) return [];
    const layer = LAYERS[layerIndex];
    const y = -470 + row * 78;
    let x = -1000 + ((row * 353) % 640);
    return [0, 1, 2].map(() => {
      const text = headlines[pick++ % headlines.length];
      const x0 = x;
      x += measure(text, `600 ${layer.size}px ${font}`) + 90;
      alphas.push(layer.alpha);
      return { text, y, x0, layer };
    });
  });

  const lockSize = 44;
  const lockWidth = measure(lockedHeadline, `700 ${lockSize}px ${font}`);
  const lockX0 = LOCK_LEFT + LAYERS[2].speed * FREEZE + lockWidth / 2;

  const node = (
    <Layout>
      {rows.map((row) => (
        <Txt
          ref={flow}
          offset={[-1, 0]}
          x={() => row.x0 - row.layer.speed * clock()}
          y={row.y}
          text={row.text}
          fontFamily={font}
          fontSize={row.layer.size}
          fontWeight={600}
          fill={row.layer.fill}
          opacity={row.layer.alpha}
        />
      ))}
      <Layout ref={lockGroup} x={() => lockX0 - LAYERS[2].speed * clock()} y={LOCK_Y}>
        <Rect
          ref={lockBox}
          width={lockWidth + 44}
          height={74}
          radius={8}
          stroke={C.yellow}
          lineWidth={3}
          shadowColor={C.yellow}
          shadowBlur={18}
          end={0}
        />
        <Txt
          ref={lockText}
          text={lockedHeadline}
          fontFamily={font}
          fontSize={lockSize}
          fontWeight={700}
          fill={C.paper}
          opacity={0.8}
        />
      </Layout>
      <Layout x={-800} y={250}>
        <RevealText
          items={lineOne}
          text={'财报前一周，消息满天飞。'}
          fontSize={66}
          fontFamily={font}
          fill={C.paper}
        />
      </Layout>
      <Layout x={-800} y={345}>
        <RevealText
          items={lineTwo}
          text={'先别急着信。'}
          fontSize={66}
          fontFamily={font}
          fill={C.yellow}
        />
      </Layout>
    </Layout>
  );

  function* play() {
    yield* clock(FREEZE - 0.4, 1.7);
    yield* clock(FREEZE, 0.55, easeOutCubic);
    lockGroup().x(lockGroup().x());
    yield* all(
      ...[...flow].map((txt, index) =>
        all(txt.fill('#3A4046', 0.4), txt.opacity(alphas[index] * 0.35, 0.4)),
      ),
      lockText().fill('#FFFFFF', 0.3),
      lockText().opacity(1, 0.3),
      lockBox().end(1, 0.55, easeInOutCubic),
    );
    yield* rise(lineOne);
    yield* rise(lineTwo);
    yield* waitFor(1.1);
    yield* all(
      sink(lineOne, 110),
      sink(lineTwo, 110),
      ...[...flow].map((txt) => txt.opacity(0, 0.4)),
      lockGroup().position([verifyBubble.x, verifyBubble.y], 0.75, easeInOutCubic),
      lockGroup().scale(verifyBubble.scale, 0.75, easeInOutCubic),
    );
  }

  function* outro() {
    yield* lockGroup().opacity(0, 0.4);
  }

  return { node, play, outro };
}
