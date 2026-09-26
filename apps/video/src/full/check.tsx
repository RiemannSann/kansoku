import { Img, Layout, Line, Rect, Txt } from '@revideo/2d';
import {
  all,
  createRef,
  createRefArray,
  easeInCubic,
  easeInOutCubic,
  easeOutExpo,
  sequence,
  waitFor,
} from '@revideo/core';
import { C, font, mono } from '../components';
import { chartExit, chartWindow } from './chart';
import { type Scene, Window, makeChrome, shotPoint } from './chrome';
import { sepaChecks, sepaVerdict } from './data';

const PANEL_X = 250;
const ROW_Y0 = -236;
const ROW_STEP = 66;
const verdictCard = {
  center: shotPoint(2540, 561, chartWindow.width),
  size: [(2848 - 2232) * (chartWindow.width / 2880), (684 - 439) * (chartWindow.width / 2880)] as [
    number,
    number,
  ],
};

export function checkScene(): Scene {
  const chrome = makeChrome('03 / CHECK', '八条全过，它还是说：先等等。');
  const root = createRef<Layout>();
  const win = createRef<Layout>();
  const ring = createRef<Rect>();
  const rows = createRefArray<Layout>();
  const ticks = createRefArray<Line>();
  const counter = createRef<Txt>();
  const stamp = createRef<Layout>();

  const node = (
    <Layout ref={root}>
      <Window
        root={win}
        x={chartExit.x}
        y={chartExit.y}
        width={chartWindow.width}
        height={chartWindow.height}
      >
        <Img src={'/captures/full/sepa.webp'} width={chartWindow.width} />
        <Rect
          ref={ring}
          position={[verdictCard.center.x, verdictCard.center.y]}
          size={verdictCard.size}
          radius={8}
          stroke={C.yellow}
          lineWidth={4}
          shadowColor={C.yellow}
          shadowBlur={20}
          end={0}
        />
      </Window>
      <Layout x={PANEL_X}>
        <Txt
          offset={[-1, 0]}
          y={ROW_Y0 - 70}
          ref={counter}
          text={'趋势模板  0 / 8'}
          fontFamily={mono}
          fontSize={26}
          fontWeight={700}
          letterSpacing={2}
          fill={C.teal}
        />
        {sepaChecks.map((check, index) => (
          <Layout key={check.label} ref={rows} y={ROW_Y0 + index * ROW_STEP} opacity={0} x={30}>
            <Rect size={28} radius={6} stroke={C.teal} lineWidth={2} fill={'#0B1614'} />
            <Line
              ref={ticks}
              points={[
                [-8, 0],
                [-2, 7],
                [9, -7],
              ]}
              stroke={C.teal}
              lineWidth={3}
              end={0}
            />
            <Txt
              offset={[-1, 0]}
              x={30}
              y={-11}
              text={check.label}
              fontFamily={font}
              fontSize={22}
              fontWeight={700}
              fill={C.paper}
            />
            <Txt
              offset={[-1, 0]}
              x={30}
              y={15}
              text={check.val}
              fontFamily={mono}
              fontSize={15}
              fill={C.dim}
            />
          </Layout>
        ))}
      </Layout>
      <Layout ref={stamp} x={PANEL_X + 330} y={318} rotation={-6} scale={2.4} opacity={0}>
        <Rect
          width={420}
          height={150}
          radius={10}
          stroke={C.yellow}
          lineWidth={5}
          fill={'#0B0E10F0'}
        />
        <Txt
          y={-22}
          text={sepaVerdict.label}
          fontFamily={mono}
          fontSize={52}
          fontWeight={800}
          letterSpacing={4}
          fill={C.yellow}
        />
        <Txt
          y={36}
          width={360}
          textAlign={'center'}
          text={'还没确认突破，而且财报在即'}
          fontFamily={font}
          fontSize={22}
          fill={C.paper}
        />
      </Layout>
      {chrome.node}
    </Layout>
  );

  function* play() {
    win().scale(chartExit.scale);
    yield* all(win().opacity(1, 0.4), chrome.enter());
    yield* sequence(
      0.07,
      ...[...rows].map((row) => all(row.opacity(1, 0.3), row.x(0, 0.5, easeOutExpo))),
    );
    yield* sequence(
      0.17,
      ...[...ticks].map((tick, index) =>
        (function* () {
          yield* tick.end(1, 0.25, easeInOutCubic);
          counter().text(`趋势模板  ${index + 1} / 8`);
        })(),
      ),
    );
    yield* waitFor(0.4);
    yield* all(stamp().opacity(1, 0.12), stamp().scale(1, 0.28, easeInCubic));
    yield* sequence(
      0.04,
      root().x(-14, 0.04),
      root().x(10, 0.05),
      root().x(-6, 0.05),
      root().x(0, 0.06),
    );
    yield* ring().end(1, 0.5, easeInOutCubic);
    yield* waitFor(1.6);
    yield* all(chrome.exit(), root().opacity(0, 0.5));
  }

  return { node, play };
}
