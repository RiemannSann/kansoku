import { Circle, Img, Layout, Rect, Txt } from '@revideo/2d';
import { all, createRef, createSignal, easeInOutCubic, linear, waitFor } from '@revideo/core';
import { C, font } from '../components';
import { type Scene, Window, makeChrome, shotPoint } from './chrome';
import { trainExit } from './train';

const W = 1184;
const H = 740;
const RIGHT = { x: 470, y: trainExit.y };
const PARTICLES = 22;
const status = {
  center: shotPoint(1616, 1490, W),
  size: [(2336 - 896) * (W / 2880) + 24, (1577 - 1404) * (W / 2880) + 20] as [number, number],
};

function arc(p: number) {
  const from = { x: trainExit.x + (W * trainExit.scale) / 2 + 10, y: trainExit.y };
  const to = { x: RIGHT.x - (W * trainExit.scale) / 2 - 10, y: RIGHT.y };
  const control = { x: 0, y: -280 };
  const q = 1 - p;
  return {
    x: q * q * from.x + 2 * q * p * control.x + p * p * to.x,
    y: q * q * from.y + 2 * q * p * control.y + p * p * to.y,
  };
}

export function syncScene(): Scene {
  const chrome = makeChrome('09 / SYNC', '换台 Mac，接着看。', [
    { text: 'iCloud 同步', accent: C.yellow },
    { text: '冲突说人话' },
    { text: '升级只下差异', accent: C.red },
  ]);
  const root = createRef<Layout>();
  const left = createRef<Layout>();
  const right = createRef<Layout>();
  const veil = createRef<Rect>();
  const ring = createRef<Rect>();
  const flow = createSignal(0);
  const stream = createSignal(0);

  const node = (
    <Layout ref={root}>
      <Window root={left} x={trainExit.x} y={trainExit.y} width={W} height={H}>
        <Img src={'/captures/new-sync.png'} width={W} />
      </Window>
      <Window root={right} x={RIGHT.x} y={RIGHT.y} width={W} height={H}>
        <Img src={'/captures/new-sync.png'} width={W} />
        <Rect
          ref={ring}
          position={[status.center.x, status.center.y]}
          size={status.size}
          radius={10}
          stroke={C.teal}
          lineWidth={6}
          shadowColor={C.teal}
          shadowBlur={24}
          end={0}
        />
        <Rect ref={veil} width={W} height={H} fill={'#050608'} opacity={0.82} />
      </Window>
      <Txt
        y={trainExit.y + 210}
        x={trainExit.x}
        text={'这台 Mac'}
        fontFamily={font}
        fontSize={24}
        fill={C.dim}
      />
      <Txt
        y={RIGHT.y + 210}
        x={RIGHT.x}
        text={'另一台 Mac'}
        fontFamily={font}
        fontSize={24}
        fill={C.dim}
      />
      {Array.from({ length: PARTICLES }, (_, index) => {
        const p = () => (flow() + index / PARTICLES) % 1;
        return (
          <Circle
            key={`p${index}`}
            size={index % 3 === 0 ? 12 : 8}
            fill={index % 4 === 0 ? C.yellow : C.teal}
            x={() => arc(p()).x}
            y={() => arc(p()).y}
            opacity={() => stream() * Math.sin(Math.PI * p())}
          />
        );
      })}
      {chrome.node}
    </Layout>
  );

  function* play() {
    left().scale(trainExit.scale);
    right().scale(trainExit.scale);
    yield* all(left().opacity(1, 0.5), right().opacity(1, 0.5), chrome.enter());
    yield* all(
      stream(1, 0.4),
      flow(3, 3.2, linear),
      (function* () {
        yield* waitFor(1.2);
        yield* veil().opacity(0, 0.8, easeInOutCubic);
        yield* ring().end(1, 0.6, easeInOutCubic);
      })(),
      (function* () {
        yield* waitFor(1.6);
        yield* chrome.pills();
      })(),
    );
    yield* stream(0, 0.4);
    yield* waitFor(0.8);
    yield* all(chrome.exit(), root().opacity(0, 0.6), left().x(-900, 0.6), right().x(900, 0.6));
  }

  return { node, play };
}
