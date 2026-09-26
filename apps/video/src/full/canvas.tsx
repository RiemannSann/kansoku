import { Img, Layout, Rect, Txt } from '@revideo/2d';
import {
  all,
  createRef,
  createSignal,
  easeInCubic,
  easeInOutCubic,
  easeOutExpo,
  linear,
  waitFor,
} from '@revideo/core';
import { C, mono } from '../components';
import { type Scene, makeChrome } from './chrome';
import { canvasCode } from './data';

const EDITOR = { x: -470, y: 50, w: 760, h: 700 };
const PANEL = { x: 430, y: 50, w: 660, h: 700 };
const LINE_H = 27;
const CROP = { cx: 2160, cy: 950, w: 1440 };
const CROP_SCALE = PANEL.w / CROP.w;
const FRAMES = Array.from({ length: 16 }, (_, index) => index + 5);

function lineColor(line: string) {
  const trimmed = line.trim();
  if (trimmed.startsWith('//')) return C.dim;
  if (trimmed.startsWith('<') || trimmed.startsWith('/>') || trimmed.includes('</')) return C.teal;
  if (/^(const|return|export|import|if|type)\b/.test(trimmed)) return C.yellow;
  return C.paper;
}

function panelPoint(px: number, py: number) {
  return { x: (px - CROP.cx) * CROP_SCALE, y: (py - CROP.cy) * CROP_SCALE };
}

export const minimized = { x: 700, y: 380, scale: 0.18 };

export function canvasScene(): Scene {
  const chrome = makeChrome('05 / CANVAS', '让它画一张盯财报的图。', [
    { text: '实时行情', accent: C.yellow },
    { text: '滑杆联动' },
    { text: '存成一个文件', accent: C.red },
  ]);
  const group = createRef<Layout>();
  const editor = createRef<Layout>();
  const code = createRef<Layout>();
  const reveal = createSignal(0);
  const bar = createRef<Rect>();
  const move = createSignal(10);
  const ring = createRef<Rect>();
  const slider = { a: panelPoint(1450, 1330), b: panelPoint(2870, 1330) };

  const node = (
    <>
      <Layout ref={group}>
        <Layout ref={editor} x={EDITOR.x} y={EDITOR.y + 120} opacity={0}>
          <Rect
            width={EDITOR.w}
            height={EDITOR.h}
            radius={14}
            fill={'#0C0F12'}
            stroke={C.border}
            lineWidth={2}
            clip
          >
            <Layout ref={code} y={0}>
              {canvasCode.map((line, index) => (
                <Layout key={`code-${index}`} y={-EDITOR.h / 2 + 76 + index * LINE_H}>
                  <Txt
                    offset={[1, 0]}
                    x={-EDITOR.w / 2 + 52}
                    text={String(index + 27)}
                    fontFamily={mono}
                    fontSize={15}
                    fill={'#4A535A'}
                  />
                  <Txt
                    offset={[-1, 0]}
                    x={-EDITOR.w / 2 + 70}
                    text={line}
                    fontFamily={mono}
                    fontSize={16}
                    fill={lineColor(line)}
                  />
                </Layout>
              ))}
            </Layout>
            <Rect y={-EDITOR.h / 2 + 22} width={EDITOR.w} height={44} fill={'#14181C'} />
            <Txt
              offset={[-1, 0]}
              x={-EDITOR.w / 2 + 22}
              y={-EDITOR.h / 2 + 22}
              text={'journal/canvases/mu-earnings-week.canvas.tsx'}
              fontFamily={mono}
              fontSize={15}
              fill={C.dim}
            />
          </Rect>
        </Layout>
        <Layout x={PANEL.x} y={PANEL.y}>
          <Rect
            width={PANEL.w}
            height={PANEL.h}
            radius={14}
            fill={'#0C0F12'}
            stroke={C.border}
            lineWidth={2}
          />
          <Rect
            x={() => -PANEL.w / 2 + (PANEL.w * reveal()) / 2}
            width={() => PANEL.w * reveal()}
            height={PANEL.h}
            radius={14}
            clip
          >
            <Layout x={() => PANEL.w / 2 - (PANEL.w * reveal()) / 2}>
              {FRAMES.map((frame) => (
                <Img
                  key={`s${frame}`}
                  src={`/captures/full/slider/s${String(frame).padStart(2, '0')}.webp`}
                  width={2880 * CROP_SCALE}
                  x={-(CROP.cx - 1440) * CROP_SCALE}
                  y={-(CROP.cy - 900) * CROP_SCALE}
                  opacity={() => (Math.round(move()) === frame ? 1 : 0)}
                />
              ))}
              <Rect
                ref={ring}
                x={(slider.a.x + slider.b.x) / 2}
                y={slider.a.y}
                width={slider.b.x - slider.a.x}
                height={40}
                radius={8}
                stroke={C.yellow}
                lineWidth={3}
                shadowColor={C.yellow}
                shadowBlur={16}
                end={0}
              />
            </Layout>
          </Rect>
          <Rect
            ref={bar}
            x={-PANEL.w / 2}
            width={4}
            height={PANEL.h}
            fill={C.teal}
            shadowColor={C.teal}
            shadowBlur={36}
            opacity={0}
          />
        </Layout>
      </Layout>
      {chrome.node}
    </>
  );

  function* play() {
    yield* all(
      chrome.enter(),
      editor().opacity(1, 0.4),
      editor().y(EDITOR.y, 0.7, easeOutExpo),
      code().y(-(canvasCode.length * LINE_H - EDITOR.h + 110), 2.2, easeInOutCubic),
    );
    bar().opacity(1);
    yield* all(reveal(1, 0.9, easeInOutCubic), bar().x(PANEL.w / 2, 0.9, easeInOutCubic));
    yield* bar().opacity(0, 0.2);
    yield* all(ring().end(1, 0.5, easeInOutCubic), chrome.pills());
    yield* move(20, 1.3, linear);
    yield* waitFor(0.3);
    yield* move(12, 0.9, linear);
    yield* waitFor(0.9);
    yield* all(
      chrome.exit(),
      group().position([minimized.x, minimized.y], 0.7, easeInCubic),
      group().scale(minimized.scale, 0.7, easeInCubic),
      group().opacity(0, 0.7),
    );
  }

  return { node, play };
}
