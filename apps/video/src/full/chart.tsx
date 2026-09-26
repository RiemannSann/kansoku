import { Img, Layout, Rect, Txt } from '@revideo/2d';
import {
  all,
  createRef,
  createRefArray,
  easeInOutCubic,
  easeOutExpo,
  sequence,
  waitFor,
} from '@revideo/core';
import { C, mono } from '../components';
import { type Scene, Window, makeChrome } from './chrome';

const CARD_W = 400;
const CARD_H = 214;
const CROP = { x: 0, y: 160, w: 2190, h: 1170 };
const CROP_SCALE = CARD_W / CROP.w;
const CARDS = [
  { src: '/captures/full/chart-5m.webp', label: '5 分钟' },
  { src: '/captures/full/chart-15m.webp', label: '15 分钟' },
  { src: '/captures/full/chart-1h.webp', label: '1 小时' },
  { src: '/captures/full/chart-1d.webp', label: '日线' },
];
const SLOT_X = [-645, -215, 215, 645];
const HERO = 1;

export const chartWindow = { x: 0, y: 40, width: 1184, height: 740 };
export const chartExit = { x: -380, y: 40, scale: 0.72 };

export function chartScene(): Scene {
  const chrome = makeChrome('02 / CHART', '打开 MU，从 5 分钟到日线摊开看。', [
    { text: '指标在本机实算', accent: C.yellow },
    { text: '画线可以留档' },
    { text: '盘前盘后都在', accent: C.red },
  ]);
  const cards = createRefArray<Layout>();
  const win = createRef<Layout>();

  const node = (
    <>
      {CARDS.map((card, index) => (
        <Layout key={card.label} ref={cards} x={SLOT_X[index]} y={40} scale={[0, 1]} skew={[0, 14]}>
          <Rect
            width={CARD_W}
            height={CARD_H}
            radius={10}
            clip
            fill={'#0A0A0A'}
            stroke={index === HERO ? C.yellow : C.border}
            lineWidth={2}
          >
            <Img
              src={card.src}
              width={2880 * CROP_SCALE}
              x={-(CROP.x + CROP.w / 2 - 1440) * CROP_SCALE}
              y={-(CROP.y + CROP.h / 2 - 900) * CROP_SCALE}
            />
          </Rect>
          <Txt
            y={CARD_H / 2 + 34}
            text={card.label}
            fontFamily={mono}
            fontSize={22}
            fontWeight={700}
            letterSpacing={2}
            fill={index === HERO ? C.yellow : C.dim}
          />
        </Layout>
      ))}
      <Window
        root={win}
        x={chartWindow.x}
        y={chartWindow.y}
        width={chartWindow.width}
        height={chartWindow.height}
      >
        <Img src={'/captures/full/chart-15m.webp'} width={chartWindow.width} />
      </Window>
      {chrome.node}
    </>
  );

  function* play() {
    yield* all(
      chrome.enter(),
      sequence(
        0.14,
        ...[...cards].map((card) =>
          all(card.scale([1, 1], 0.7, easeOutExpo), card.skew([0, -6], 0.7, easeOutExpo)),
        ),
      ),
    );
    yield* waitFor(0.9);
    const hero = cards[HERO];
    yield* all(
      ...[...cards].map((card, index) =>
        index === HERO
          ? all(
              card.skew([0, 0], 0.8, easeInOutCubic),
              card.position([chartWindow.x, chartWindow.y], 0.8, easeInOutCubic),
              card.scale(chartWindow.width / CARD_W, 0.8, easeInOutCubic),
            )
          : all(
              card.x(SLOT_X[index] + (index < HERO ? -900 : 900), 0.7, easeInOutCubic),
              card.opacity(0, 0.5),
            ),
      ),
    );
    yield* all(win().opacity(1, 0.3), hero.opacity(0, 0.35));
    yield* all(
      chrome.pills(),
      win().scale(1.05, 2.6, easeInOutCubic),
      win().y(chartWindow.y - 16, 2.6, easeInOutCubic),
    );
    yield* waitFor(0.4);
    yield* all(
      chrome.exit(),
      win().position([chartExit.x, chartExit.y], 0.7, easeInOutCubic),
      win().scale(chartExit.scale, 0.7, easeInOutCubic),
    );
  }

  function* outro() {
    yield* win().opacity(0, 0.4);
  }

  return { node, play, outro };
}
