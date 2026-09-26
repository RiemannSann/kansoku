import { Img, Layout, Line, Rect, Txt } from '@revideo/2d';
import {
  all,
  createRef,
  createSignal,
  easeInCubic,
  easeInOutCubic,
  easeOutExpo,
  linear,
  sequence,
  tween,
  waitFor,
} from '@revideo/core';
import { C, font, mono } from '../components';
import { type Scene, Window, makeChrome } from './chrome';
import { amdBars, amdDayStarts, amdHistoryBars, amdLastClose, amdQuestionClose } from './data';

const WIN_W = 1100;
const WIN_H = Math.round((WIN_W * 1720) / 2560);
const S = WIN_W / 2560;
const SHOT_Y = 16;
const toWin = (px: number, py: number) => ({ x: (px - 1280) * S, y: (py - 860) * S + SHOT_Y });

const PANEL = { w: 1560, h: 660, y: 60 };
const PLOT = { left: -700, right: 690, top: -200, bottom: 230 };
const LOW = 93.6;
const HIGH = 101.4;
const FUTURE = amdBars.length - amdHistoryBars;
const step = (PLOT.right - PLOT.left) / amdBars.length;
const bx = (index: number) => PLOT.left + step * (index + 0.5);
const by = (price: number) =>
  PLOT.bottom - ((price - LOW) / (HIGH - LOW)) * (PLOT.bottom - PLOT.top);
const questionX = bx(amdHistoryBars - 1) + step / 2;

const header = { center: toWin(441, 42), w: (705 - 177) * S + 24, h: 32 };
const questionTag = { center: toWin(1357, 102), w: 237 * S + 20, h: 26 };

export const trainExit = { x: -470, y: 60, scale: 0.46 };

export function trainScene(): Scene {
  const chrome = makeChrome('08 / TRAIN', '周末，遮住答案再练一次。', [
    { text: '匿名代码和日期', accent: C.yellow },
    { text: '逐根推进' },
    { text: '最后揭晓真身', accent: C.red },
  ]);
  const win = createRef<Layout>();
  const ringHeader = createRef<Rect>();
  const ringQuestion = createRef<Rect>();
  const panel = createRef<Layout>();
  const progress = createSignal(0);
  const counter = createRef<Txt>();
  const ticker = createRef<Txt>();
  const tags = createRef<Layout>();

  const maskLeft = () => questionX + (PLOT.right + 16 - questionX) * progress();
  const shown = (index: number) =>
    index < amdHistoryBars || progress() * FUTURE >= index - amdHistoryBars + 1;

  const node = (
    <>
      <Window root={win} x={1500} width={WIN_W} height={WIN_H}>
        <Img src={'/captures/full/train/t00.webp'} width={WIN_W} y={SHOT_Y} />
        <Rect
          ref={ringHeader}
          position={[header.center.x, header.center.y]}
          size={[header.w, header.h]}
          radius={6}
          stroke={C.yellow}
          lineWidth={3}
          end={0}
        />
        <Rect
          ref={ringQuestion}
          position={[questionTag.center.x, questionTag.center.y]}
          size={[questionTag.w, questionTag.h]}
          radius={6}
          stroke={C.yellow}
          lineWidth={3}
          end={0}
        />
      </Window>
      <Layout ref={panel} y={PANEL.y} opacity={0}>
        <Rect
          width={PANEL.w}
          height={PANEL.h}
          radius={16}
          fill={'#0B0E10'}
          stroke={C.border}
          lineWidth={2}
        />
        <Txt
          offset={[-1, 0]}
          x={PLOT.left}
          y={-PANEL.h / 2 + 44}
          text={'盲盘训练'}
          fontFamily={font}
          fontSize={22}
          fill={C.dim}
        />
        <Txt
          ref={ticker}
          offset={[-1, 0]}
          x={PLOT.left + 110}
          y={-PANEL.h / 2 + 44}
          text={'ASSET557.SIM · 5 分钟'}
          fontFamily={mono}
          fontSize={32}
          fontWeight={800}
          letterSpacing={2}
          fill={C.paper}
        />
        <Txt
          ref={counter}
          offset={[1, 0]}
          x={PLOT.right}
          y={-PANEL.h / 2 + 44}
          text={`逐根推进  0 / ${FUTURE}`}
          fontFamily={mono}
          fontSize={22}
          fill={C.teal}
        />
        {amdBars.map(([open, highPrice, lowPrice, close], index) => (
          <Layout key={`bar${index}`} opacity={() => (shown(index) ? 1 : 0)}>
            <Line
              points={[
                [bx(index), by(highPrice)],
                [bx(index), by(lowPrice)],
              ]}
              stroke={close >= open ? C.teal : C.red}
              lineWidth={1}
            />
            <Rect
              x={bx(index)}
              y={(by(open) + by(close)) / 2}
              width={Math.max(2, step - 2)}
              height={Math.max(1, Math.abs(by(open) - by(close)))}
              fill={close >= open ? C.teal : C.red}
            />
          </Layout>
        ))}
        {amdDayStarts.map((index, order) => (
          <Layout key={`day${index}`} opacity={() => (shown(index) ? 1 : 0)}>
            <Line
              points={[
                [bx(index) - step / 2, PLOT.top - 20],
                [bx(index) - step / 2, PLOT.bottom + 10],
              ]}
              stroke={'#2A3036'}
              lineWidth={1}
              lineDash={[4, 6]}
            />
            <Txt
              offset={[-1, 0]}
              x={bx(index) + 6}
              y={PLOT.bottom + 34}
              text={order === 0 ? '3/8 周一' : '3/9 周二'}
              fontFamily={font}
              fontSize={18}
              fill={C.dim}
            />
          </Layout>
        ))}
        <Line
          points={[
            [questionX, PLOT.top - 20],
            [questionX, PLOT.bottom + 10],
          ]}
          stroke={C.yellow}
          lineWidth={2}
          lineDash={[8, 6]}
        />
        <Txt
          offset={[1, 0]}
          x={questionX - 10}
          y={PLOT.top - 6}
          text={'题目到此'}
          fontFamily={font}
          fontSize={18}
          fill={C.yellow}
        />
        <Rect
          x={() => (maskLeft() + PLOT.right + 16) / 2}
          y={(PLOT.top + PLOT.bottom) / 2 - 5}
          width={() => Math.max(0, PLOT.right + 16 - maskLeft())}
          height={PLOT.bottom - PLOT.top + 30}
          fill={'#0D1013'}
        />
        <Txt
          x={() => (maskLeft() + PLOT.right + 16) / 2}
          y={-30}
          text={'？'}
          fontFamily={font}
          fontSize={110}
          fontWeight={800}
          fill={C.yellow}
          opacity={() => Math.max(0, 1 - progress() * 2.2)}
        />
        <Txt
          x={() => (maskLeft() + PLOT.right + 16) / 2}
          y={60}
          text={`${FUTURE} 根答案`}
          fontFamily={font}
          fontSize={24}
          fill={C.dim}
          opacity={() => Math.max(0, 1 - progress() * 2.2)}
        />
        <Line
          points={() => [
            [maskLeft(), PLOT.top - 20],
            [maskLeft(), PLOT.bottom + 10],
          ]}
          stroke={C.teal}
          lineWidth={3}
          shadowColor={C.teal}
          shadowBlur={18}
          opacity={() => (progress() > 0 && progress() < 1 ? 1 : 0)}
        />
        <Layout ref={tags} opacity={0}>
          <Rect
            offset={[1, 0]}
            x={questionX - 10}
            y={by(100) + 30}
            padding={[5, 10]}
            radius={4}
            layout
            fill={'#0B0E10'}
            stroke={C.yellow}
            lineWidth={1}
          >
            <Txt
              text={`题目收盘 $${amdQuestionClose.toFixed(2)}`}
              fontFamily={mono}
              fontSize={16}
              fill={C.yellow}
            />
          </Rect>
          <Rect
            offset={[1, 0]}
            x={PLOT.right}
            y={by(amdBars[amdBars.length - 1][3]) - 34}
            padding={[5, 10]}
            radius={4}
            layout
            fill={'#0B0E10'}
            stroke={C.teal}
            lineWidth={1}
          >
            <Txt
              text={`两天后 $${amdLastClose.toFixed(2)}`}
              fontFamily={mono}
              fontSize={16}
              fill={C.teal}
            />
          </Rect>
        </Layout>
      </Layout>
      {chrome.node}
    </>
  );

  function* play() {
    yield* all(win().opacity(1, 0.3), win().x(0, 0.8, easeOutExpo), chrome.enter());
    yield* sequence(
      0.25,
      ringHeader().end(1, 0.5, easeInOutCubic),
      ringQuestion().end(1, 0.5, easeInOutCubic),
    );
    yield* waitFor(0.5);
    yield* all(
      win().scale(1.6, 0.7, easeInCubic),
      win().opacity(0, 0.6),
      panel().opacity(1, 0.6),
      panel().scale(0.94, 0).to(1, 0.7, easeOutExpo),
    );
    yield* tween(3, (t) => {
      progress(linear(t));
      counter().text(`逐根推进  ${Math.round(linear(t) * FUTURE)} / ${FUTURE}`);
    });
    yield* all(
      ticker().text('AMD.US · 2021-03-05', 1.1),
      ticker().fill(C.yellow, 1.1),
      chrome.pills(),
    );
    yield* tags().opacity(1, 0.4);
    yield* waitFor(1.3);
    yield* all(
      chrome.exit(),
      panel().position([trainExit.x, trainExit.y], 0.7, easeInOutCubic),
      panel().scale((1184 * trainExit.scale) / PANEL.w, 0.7, easeInOutCubic),
    );
  }

  function* outro() {
    yield* panel().opacity(0, 0.5, easeInCubic);
  }

  return { node, play, outro };
}
