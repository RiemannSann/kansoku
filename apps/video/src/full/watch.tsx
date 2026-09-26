import { Circle, Img, Layout, Line, Rect, Txt } from '@revideo/2d';
import {
  all,
  createRef,
  createSignal,
  easeInOutCubic,
  easeOutExpo,
  linear,
  map,
  tween,
  waitFor,
} from '@revideo/core';
import { C, font, mono } from '../components';
import { type Scene, makeChrome } from './chrome';
import { muMinutes } from './data';

const PREV_HIGH = 1081.04;
const CHART = { left: -820, right: 120, top: -140, bottom: 250 };
const START = 15 * 60 + 15;
const ALERT = 15 * 60 + 37;
const prices = muMinutes.map(([, price]) => price);
const low = Math.min(...prices) - 0.6;
const high = Math.max(...prices) + 0.6;
const px = (index: number) =>
  CHART.left + (index * (CHART.right - CHART.left)) / (muMinutes.length - 1);
const py = (price: number) =>
  CHART.bottom - ((price - low) / (high - low)) * (CHART.bottom - CHART.top);
const pad = (value: number) => String(value).padStart(2, '0');
const clockText = (value: number) =>
  `${pad(Math.floor(value / 60))}:${pad(Math.floor(value % 60))}`;

export function watchScene(): Scene {
  const chrome = makeChrome('06 / WATCH', '关掉图表，它在后台接着盯。', [
    { text: 'AI 跟进', accent: C.yellow },
    { text: '破位才提醒' },
    { text: '点开就是证据', accent: C.red },
  ]);
  const root = createRef<Layout>();
  const mini = createRef<Layout>();
  const minute = createSignal(START);
  const guide = createRef<Line>();
  const toast = createRef<Layout>();
  const dot = createRef<Circle>();
  const clock = createRef<Txt>();

  const progress = () => Math.min(1, (minute() - START) / (muMinutes.length - 1));
  const tipIndex = () => Math.min(muMinutes.length - 1, Math.round(minute() - START));

  const node = (
    <Layout ref={root} opacity={0}>
      <Layout ref={mini} x={610} y={250} scale={0.34}>
        <Rect
          width={1184}
          height={740}
          radius={16}
          fill={'#0A0A0A'}
          stroke={C.border}
          lineWidth={3}
          clip
        >
          <Img src={'/captures/full/watch.webp'} width={1184} />
        </Rect>
      </Layout>
      <Txt
        offset={[-1, 0]}
        x={CHART.left}
        y={CHART.top - 150}
        text={'美东时间 · 9 月 25 日 · MU.US'}
        fontFamily={font}
        fontSize={24}
        fill={C.dim}
      />
      <Txt
        offset={[-1, 0]}
        x={CHART.left - 6}
        y={CHART.top - 78}
        ref={clock}
        text={clockText(START)}
        fontFamily={mono}
        fontSize={110}
        fontWeight={800}
        letterSpacing={6}
        fill={C.paper}
      />
      <Line
        ref={guide}
        points={[
          [CHART.left, py(PREV_HIGH)],
          [CHART.right, py(PREV_HIGH)],
        ]}
        stroke={C.dim}
        lineWidth={2}
        lineDash={[10, 8]}
      />
      <Txt
        offset={[-1, 0]}
        x={CHART.right + 18}
        y={py(PREV_HIGH)}
        text={`前日高点 ${PREV_HIGH}`}
        fontFamily={mono}
        fontSize={20}
        fill={() => (minute() >= ALERT - 2 ? C.red : C.dim)}
      />
      <Line
        points={muMinutes.map(([, price], index) => [px(index), py(price)] as [number, number])}
        stroke={C.teal}
        lineWidth={4}
        end={progress}
      />
      <Circle
        ref={dot}
        size={16}
        fill={C.teal}
        x={() => px(tipIndex())}
        y={() => py(prices[tipIndex()])}
      />
      <Layout ref={toast} x={1260} y={-330}>
        <Rect
          width={560}
          height={128}
          radius={20}
          fill={'#1C2126F2'}
          stroke={'#3A4148'}
          lineWidth={1}
          shadowColor={'#000000'}
          shadowBlur={40}
          shadowOffsetY={14}
        />
        <Img x={-226} y={-10} src={'/brand/kansoku-icon.png'} width={56} />
        <Txt
          offset={[-1, 0]}
          x={-184}
          y={-30}
          text={'Kansoku · MU.US'}
          fontFamily={font}
          fontSize={22}
          fontWeight={700}
          fill={C.paper}
        />
        <Txt
          offset={[1, 0]}
          x={256}
          y={-30}
          text={'15:37'}
          fontFamily={mono}
          fontSize={18}
          fill={C.dim}
        />
        <Txt
          offset={[-1, 0]}
          x={-184}
          y={6}
          text={'跌破前日高点 1081.04'}
          fontFamily={font}
          fontSize={22}
          fill={C.red}
        />
        <Txt
          offset={[-1, 0]}
          x={-184}
          y={38}
          text={'1081.97 → 1080.31 · 后台跟进触发'}
          fontFamily={mono}
          fontSize={16}
          fill={C.dim}
        />
      </Layout>
      {chrome.node}
    </Layout>
  );

  function* play() {
    yield* all(root().opacity(1, 0.5), chrome.enter(), mini().scale(0.3, 0.8, easeOutExpo));
    yield* tween(2.6, (t) => {
      minute(map(START, ALERT - 2, easeInOutCubic(t)));
      clock().text(clockText(minute()));
    });
    yield* all(
      guide().stroke(C.red, 0.25),
      dot().fill(C.red, 0.25),
      tween(0.8, (t) => {
        minute(map(ALERT - 2, ALERT, linear(t)));
        clock().text(clockText(minute()));
      }),
    );
    yield* toast().x(610, 0.7, easeOutExpo);
    yield* all(chrome.pills(), dot().scale(1.8, 0.3).to(1, 0.3), mini().scale(0.32, 0.6));
    yield* waitFor(1.4);
    yield* all(chrome.exit(), root().opacity(0, 0.5), toast().y(-420, 0.5, easeInOutCubic));
  }

  return { node, play };
}
