import { Gradient, Img, Layout, Rect, Txt } from '@revideo/2d';
import {
  type Reference,
  type ReferenceArray,
  type SimpleSignal,
  type ThreadGenerator,
  all,
  easeInCubic,
  easeInOutCubic,
  easeOutExpo,
  sequence,
} from '@revideo/core';

const SHOT_SCALE = 1660 / 2880;

export interface Shot {
  x: number;
  y: number;
  scale: number;
}

export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

function tokenize(text: string, perChar: boolean) {
  return perChar ? [...text] : (text.match(/[A-Za-z0-9.%/]+|\s+|./gu) ?? []);
}

let measureCtx: CanvasRenderingContext2D | null = null;

export function measure(token: string, font: string) {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  measureCtx!.font = font;
  return measureCtx!.measureText(token).width;
}

export function RevealText({
  items,
  text,
  fontSize,
  fontFamily,
  fontWeight = 700,
  fill,
  perChar = false,
  gap = 0,
  align = 'left',
}: {
  items: ReferenceArray<Txt>;
  text: string;
  fontSize: number;
  fontFamily: string;
  fontWeight?: number;
  fill: string;
  perChar?: boolean;
  gap?: number;
  align?: 'left' | 'center';
}) {
  const lineHeight = Math.round(fontSize * 1.4);
  const cssFont = `${fontWeight} ${fontSize}px ${fontFamily}`;
  const tokens = tokenize(text, perChar).map((token) => ({
    token,
    width: measure(token, cssFont),
  }));
  const total = tokens.reduce((sum, t) => sum + t.width, 0) + gap * (tokens.length - 1);
  let cursor = align === 'center' ? -total / 2 : 0;
  const placed = tokens.map((t) => {
    const x = cursor + t.width / 2;
    cursor += t.width + gap;
    return { ...t, x };
  });
  return (
    <Layout>
      {placed
        .filter((t) => t.token.trim() !== '')
        .map((t) => (
          <Rect x={t.x} width={t.width + 4} height={lineHeight} clip>
            <Txt
              ref={items}
              y={lineHeight}
              text={t.token}
              fontSize={fontSize}
              fontFamily={fontFamily}
              fontWeight={fontWeight}
              fill={fill}
            />
          </Rect>
        ))}
    </Layout>
  );
}

export function rise(items: ReferenceArray<Txt>, stagger = 0.028): ThreadGenerator {
  return sequence(stagger, ...[...items].map((item) => item.y(0, 0.7, easeOutExpo)));
}

export function sink(items: ReferenceArray<Txt>, distance: number): ThreadGenerator {
  return sequence(0.01, ...[...items].map((item) => item.y(-distance, 0.32, easeInCubic)));
}

export function* popIn(rail: Layout): ThreadGenerator {
  const pills = rail.children();
  for (const pill of pills) {
    pill.opacity(0);
    pill.scale(0.8);
  }
  rail.opacity(1);
  yield* sequence(
    0.07,
    ...pills.map((pill) => all(pill.opacity(1, 0.35), pill.scale(1, 0.6, easeOutExpo))),
  );
}

export function cropBox(shot: Shot, region: Region) {
  const s = shot.scale * SHOT_SCALE;
  return {
    x: shot.x + s * (region.x + region.w / 2 - 1440),
    y: shot.y + s * (region.y + region.h / 2 - 900),
    w: s * region.w,
    h: s * region.h,
  };
}

const sheen = new Gradient({
  from: [-70, 0],
  to: [70, 0],
  stops: [
    { offset: 0, color: '#FFFFFF00' },
    { offset: 0.5, color: '#FFFFFF33' },
    { offset: 1, color: '#FFFFFF00' },
  ],
});

export function Extract({
  card,
  sweep,
  src,
  shot,
  region,
  accent,
  offsetY,
}: {
  card: Reference<Rect>;
  sweep: Reference<Rect>;
  src: string;
  shot: Shot;
  region: Region;
  accent: string;
  offsetY: number;
}) {
  const box = cropBox(shot, region);
  return (
    <Rect
      ref={card}
      x={box.x}
      y={box.y + offsetY}
      width={box.w}
      height={box.h}
      radius={10}
      clip
      fill={'#0A0A0A'}
      stroke={accent}
      lineWidth={2}
      opacity={0}
      shadowColor={'#000000'}
      shadowBlur={0}
    >
      <Img src={src} width={1660} scale={shot.scale} x={shot.x - box.x} y={shot.y - box.y} />
      <Rect
        ref={sweep}
        width={140}
        height={box.h * 3}
        rotation={18}
        x={-box.w / 2 - 260}
        fill={sheen}
      />
    </Rect>
  );
}

export function* lift(card: Rect, sweep: Rect, dim: Rect): ThreadGenerator {
  card.opacity(1);
  yield* all(
    dim.opacity(0.66, 0.5),
    card.scale(1.14, 0.9, easeOutExpo),
    card.x(0, 0.9, easeOutExpo),
    card.y(card.y() - 26, 0.9, easeOutExpo),
    card.shadowBlur(90, 0.9),
    sweep.x(card.width() / 2 + 260, 1.1, easeInOutCubic),
  );
}

export function* drop(card: Rect, dim: Rect): ThreadGenerator {
  yield* all(dim.opacity(0, 0.4), card.opacity(0, 0.35), card.scale(1.2, 0.4, easeInCubic));
}

export function* wipe(width: SimpleSignal<number>, bar: Rect): ThreadGenerator {
  width(0);
  bar.x(-830);
  bar.opacity(1);
  yield* all(width(1660, 0.9, easeInOutCubic), bar.x(830, 0.9, easeInOutCubic));
  yield* bar.opacity(0, 0.2);
}
