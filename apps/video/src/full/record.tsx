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
import { type Scene, Window, makeChrome } from './chrome';
import { memoryEntry } from './data';

const TREE_X = 110;
const INDENT = 34;
const TREE = [
  { text: 'Agent Workspace/', depth: 0, y: -290 },
  { text: 'stocks/', depth: 1, y: -226 },
  { text: 'MU.md', depth: 2, y: -180, tag: '深度研究' },
  { text: 'journal/canvases/', depth: 1, y: -122 },
  { text: 'mu-earnings-week.canvas.tsx', depth: 2, y: -76, tag: '画布' },
  { text: 'journal/charts/data/', depth: 1, y: -18 },
  { text: '2026-09-25-mu-sepa.json', depth: 2, y: 28, tag: 'SEPA' },
  { text: 'memory/', depth: 1, y: 86 },
  { text: 'MEMORY.md', depth: 2, y: 132, tag: '记忆' },
];
const PARENT = [-1, 0, 1, 0, 3, 0, 5, 0, 7];
const WIN = { w: 1184, h: 740 };
const PARKED = { x: -470, y: 40, scale: 0.56 };

export function recordScene(): Scene {
  const chrome = makeChrome('07 / RECORD', '研究落成文件，它也记住你的规矩。', [
    { text: 'Markdown / JSON', accent: C.yellow },
    { text: '你也能直接改' },
    { text: '跟着 iCloud 走', accent: C.red },
  ]);
  const root = createRef<Layout>();
  const win = createRef<Layout>();
  const items = createRefArray<Layout>();
  const links = createRefArray<Line>();
  const bridge = createRef<Line>();
  const card = createRef<Layout>();
  const typed = createRef<Txt>();

  const x = (depth: number) => TREE_X + depth * INDENT;
  const winEdge = PARKED.x + (WIN.w * PARKED.scale) / 2;

  const node = (
    <Layout ref={root}>
      <Window root={win} width={WIN.w} height={WIN.h}>
        <Img src={'/captures/full/research.webp'} width={WIN.w} />
      </Window>
      <Line
        ref={bridge}
        points={[
          [winEdge + 4, -120],
          [winEdge + 60, -120],
          [winEdge + 60, TREE[2].y],
          [x(2) - 14, TREE[2].y],
        ]}
        radius={10}
        stroke={C.yellow}
        lineWidth={2}
        lineDash={[6, 6]}
        end={0}
      />
      {TREE.map((item, index) =>
        index === 0 ? null : (
          <Line
            key={`link-${item.text}`}
            ref={links}
            points={[
              [x(TREE[PARENT[index]].depth) + 8, TREE[PARENT[index]].y + 16],
              [x(TREE[PARENT[index]].depth) + 8, item.y],
              [x(item.depth) - 8, item.y],
            ]}
            radius={6}
            stroke={'#3A4148'}
            lineWidth={2}
            end={0}
          />
        ),
      )}
      {TREE.map((item) => (
        <Layout key={item.text} ref={items} x={x(item.depth)} y={item.y} opacity={0}>
          <Txt
            offset={[-1, 0]}
            text={item.text}
            fontFamily={mono}
            fontSize={item.depth === 2 ? 23 : 21}
            fontWeight={item.depth === 2 ? 700 : 400}
            fill={item.depth === 2 ? C.paper : C.dim}
          />
          {item.tag ? (
            <Rect
              offset={[-1, 0]}
              x={item.text.length * 14 + 22}
              padding={[3, 10]}
              radius={4}
              layout
              fill={'#F7C84322'}
              stroke={C.yellow}
              lineWidth={1}
            >
              <Txt
                text={item.tag}
                fontFamily={font}
                fontSize={16}
                fontWeight={700}
                fill={C.yellow}
              />
            </Rect>
          ) : null}
        </Layout>
      ))}
      <Layout ref={card} x={x(2) + 330} y={232} scale={0.6} opacity={0}>
        <Rect
          width={780}
          height={92}
          radius={12}
          fill={'#0F1215'}
          stroke={C.yellow}
          lineWidth={2}
        />
        <Txt
          offset={[-1, 0]}
          x={-366}
          y={-22}
          text={'memory/MEMORY.md'}
          fontFamily={mono}
          fontSize={15}
          fill={C.dim}
        />
        <Txt
          ref={typed}
          offset={[-1, 0]}
          x={-366}
          y={14}
          text={''}
          fontFamily={font}
          fontSize={20}
          fontWeight={600}
          fill={C.yellow}
        />
      </Layout>
      {chrome.node}
    </Layout>
  );

  function* play() {
    win().scale(0.9);
    yield* all(win().opacity(1, 0.4), win().scale(1, 0.6, easeOutExpo), chrome.enter());
    yield* waitFor(0.5);
    yield* all(
      win().position([PARKED.x, PARKED.y], 0.8, easeInOutCubic),
      win().scale(PARKED.scale, 0.8, easeInOutCubic),
    );
    yield* all(
      items[0].opacity(1, 0.3),
      sequence(
        0.12,
        ...[...links].map((link, index) =>
          all(link.end(1, 0.3, easeInOutCubic), items[index + 1].opacity(1, 0.35)),
        ),
      ),
    );
    yield* bridge().end(1, 0.6, easeInOutCubic);
    yield* all(card().opacity(1, 0.3), card().scale(1, 0.5, easeOutExpo), chrome.pills());
    yield* typed().text(memoryEntry, 1.8);
    yield* waitFor(1.3);
    yield* all(chrome.exit(), root().x(-1500, 0.7, easeInCubic), root().opacity(0, 0.6));
  }

  return { node, play };
}
