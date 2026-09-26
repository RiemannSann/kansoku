import { type ComponentChildren, Layout, Rect, Txt } from '@revideo/2d';
import {
  type Reference,
  type ThreadGenerator,
  all,
  createRef,
  createRefArray,
  delay,
} from '@revideo/core';
import { C, Pill, font, mono } from '../components';
import { RevealText, popIn, rise, sink } from '../motion';

export interface Scene {
  node: ComponentChildren;
  play: () => ThreadGenerator;
  outro?: () => ThreadGenerator;
}

export interface PillSpec {
  text: string;
  accent?: string;
}

export function makeChrome(code: string, title: string, pills: PillSpec[] = []) {
  const codeRef = createRef<Txt>();
  const items = createRefArray<Txt>();
  const rail = createRef<Layout>();
  const node = (
    <>
      <Txt
        ref={codeRef}
        x={-790}
        y={-468}
        offset={[-1, 0]}
        text={''}
        fontFamily={mono}
        fontSize={20}
        fontWeight={700}
        letterSpacing={4}
        fill={C.yellow}
      />
      <Layout x={-790} y={-402}>
        <RevealText
          items={items}
          text={title}
          fontSize={62}
          fontFamily={font}
          fontWeight={700}
          fill={C.paper}
        />
      </Layout>
      <Layout ref={rail} layout y={452} direction={'row'} gap={14} opacity={0}>
        {pills.map((pill) => (
          <Pill text={pill.text} accent={pill.accent} />
        ))}
      </Layout>
    </>
  );
  return {
    node,
    enter: (): ThreadGenerator => all(codeRef().text(code, 0.45), delay(0.2, rise(items))),
    pills: (): ThreadGenerator => (pills.length > 0 ? popIn(rail()) : all()),
    exit: (): ThreadGenerator =>
      all(codeRef().text('', 0.3), sink(items, 90), rail().opacity(0, 0.3)),
  };
}

export const SHOT_W = 2880;
export const SHOT_H = 1800;

export function shotPoint(px: number, py: number, width: number, naturalWidth = SHOT_W) {
  const s = width / naturalWidth;
  const naturalHeight = (naturalWidth * SHOT_H) / SHOT_W;
  return { x: s * (px - naturalWidth / 2), y: s * (py - naturalHeight / 2), s };
}

export function Window({
  root,
  width,
  height,
  children,
  x = 0,
  y = 40,
}: {
  root: Reference<Layout>;
  width: number;
  height: number;
  children: ComponentChildren;
  x?: number;
  y?: number;
}) {
  return (
    <Layout ref={root} x={x} y={y} opacity={0}>
      <Rect
        width={width}
        height={height}
        radius={16}
        fill={'#0A0A0A'}
        shadowColor={'#000000'}
        shadowBlur={60}
        shadowOffsetY={26}
      />
      <Rect width={width} height={height} radius={16} clip stroke={C.border} lineWidth={2}>
        {children}
        <Rect y={-height / 2 + 16} width={width} height={32} fill={'#171B1F'} />
        <Layout x={-width / 2 + 52} y={-height / 2 + 16} layout direction={'row'} gap={9}>
          <Rect size={10} radius={5} fill={C.red} />
          <Rect size={10} radius={5} fill={C.yellow} />
          <Rect size={10} radius={5} fill={C.teal} />
        </Layout>
      </Rect>
    </Layout>
  );
}
