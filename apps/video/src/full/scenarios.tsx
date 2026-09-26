import { Img, Layout, Line, Rect, Txt } from '@revideo/2d';
import {
  all,
  createRef,
  createRefArray,
  easeInCubic,
  easeInOutCubic,
  easeOutExpo,
  sequence,
  tween,
  waitFor,
} from '@revideo/core';
import { C, font, mono } from '../components';
import { chartWindow } from './chart';
import { type Scene, Window, makeChrome } from './chrome';

const CARD_W = 460;
const CARD_H = 330;
const SCENARIOS = [
  {
    name: '区间震荡',
    pct: 50,
    color: C.yellow,
    desc: '围绕 1081.04 与 VWAP 1087.50 反复拉锯，上冲 1100 附近受压、下探 1073 附近获承接',
    trigger: '触发：15 分钟收盘保持在 1073 与 1100 之间',
  },
  {
    name: '向上恢复',
    pct: 30,
    color: C.teal,
    desc: '先测试 1100 期权压力，突破后回看日内高点 1108.72',
    trigger: '触发：15 分钟放量站稳 1087.50，并进一步收上 1100',
  },
  {
    name: '向下破位',
    pct: 20,
    color: C.red,
    desc: '先回看 1064.25；卖压继续扩大，再测试前日低位 1044',
    trigger: '触发：15 分钟收盘跌破 1073，随后反抽不能收回',
  },
];
const FAN = [
  { x: -500, y: 70, rotation: -4 },
  { x: 0, y: 40, rotation: 0 },
  { x: 500, y: 70, rotation: 4 },
];

export function scenariosScene(): Scene {
  const chrome = makeChrome('04 / SCENARIOS', '它不硬猜方向，给三种走法，各带触发条件。');
  const win = createRef<Layout>();
  const cards = createRefArray<Layout>();
  const bars = createRefArray<Rect>();
  const marks = createRefArray<Line>();
  const counts = createRefArray<Txt>();

  const node = (
    <>
      <Window root={win} width={chartWindow.width} height={chartWindow.height}>
        <Img src={'/captures/full/chart-15m.webp'} width={chartWindow.width} />
        <Rect
          width={chartWindow.width}
          height={chartWindow.height}
          fill={'#000000'}
          opacity={0.62}
        />
      </Window>
      {SCENARIOS.map((item) => (
        <Layout key={item.name} ref={cards} x={420} y={150} scale={0.5} opacity={0}>
          <Rect
            width={CARD_W}
            height={CARD_H}
            radius={14}
            fill={'#0F1215'}
            stroke={item.color}
            lineWidth={2}
            shadowColor={'#000000'}
            shadowBlur={40}
            shadowOffsetY={16}
          />
          <Txt
            offset={[-1, 0]}
            x={-CARD_W / 2 + 28}
            y={-CARD_H / 2 + 44}
            text={item.name}
            fontFamily={font}
            fontSize={30}
            fontWeight={700}
            fill={C.paper}
          />
          <Txt
            offset={[1, 0]}
            x={CARD_W / 2 - 28}
            y={-CARD_H / 2 + 46}
            ref={counts}
            text={'0%'}
            fontFamily={mono}
            fontSize={46}
            fontWeight={800}
            fill={item.color}
          />
          <Rect
            offset={[-1, 0]}
            x={-CARD_W / 2 + 28}
            y={-CARD_H / 2 + 96}
            width={CARD_W - 56}
            height={8}
            radius={4}
            fill={'#20262B'}
          />
          <Rect
            ref={bars}
            offset={[-1, 0]}
            x={-CARD_W / 2 + 28}
            y={-CARD_H / 2 + 96}
            width={0}
            height={8}
            radius={4}
            fill={item.color}
          />
          <Txt
            offset={[-1, -1]}
            x={-CARD_W / 2 + 28}
            y={-CARD_H / 2 + 124}
            width={CARD_W - 56}
            text={item.desc}
            fontFamily={font}
            fontSize={19}
            lineHeight={30}
            textWrap
            fill={C.dim}
          />
          <Txt
            offset={[-1, -1]}
            x={-CARD_W / 2 + 28}
            y={CARD_H / 2 - 92}
            width={CARD_W - 56}
            text={item.trigger}
            fontFamily={font}
            fontSize={19}
            fontWeight={600}
            lineHeight={30}
            textWrap
            fill={C.paper}
          />
          <Line
            ref={marks}
            points={[
              [-CARD_W / 2 + 28, CARD_H / 2 - 22],
              [CARD_W / 2 - 28, CARD_H / 2 - 22],
            ]}
            stroke={C.red}
            lineWidth={3}
            end={0}
          />
        </Layout>
      ))}
      {chrome.node}
    </>
  );

  function* play() {
    yield* all(win().opacity(1, 0.4), chrome.enter());
    yield* sequence(
      0.1,
      ...[...cards].map((card, index) =>
        all(
          card.opacity(1, 0.3),
          card.position([FAN[index].x, FAN[index].y], 0.8, easeOutExpo),
          card.rotation(FAN[index].rotation, 0.8, easeOutExpo),
          card.scale(1, 0.8, easeOutExpo),
        ),
      ),
    );
    yield* all(
      ...[...bars].map((bar, index) =>
        all(
          bar.width(((CARD_W - 56) * SCENARIOS[index].pct) / 100, 0.9, easeInOutCubic),
          tween(0.9, (t) =>
            counts[index].text(`${Math.round(easeInOutCubic(t) * SCENARIOS[index].pct)}%`),
          ),
        ),
      ),
    );
    yield* sequence(0.22, ...[...marks].map((mark) => mark.end(1, 0.45, easeInOutCubic)));
    yield* waitFor(1.5);
    yield* all(
      chrome.exit(),
      win().opacity(0, 0.5),
      sequence(
        0.08,
        ...[...cards].map((card, index) =>
          all(
            card.y(900, 0.6, easeInCubic),
            card.rotation(FAN[index].rotation * 4, 0.6, easeInCubic),
          ),
        ),
      ),
    );
  }

  return { node, play };
}
