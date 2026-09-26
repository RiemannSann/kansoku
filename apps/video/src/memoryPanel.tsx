import { Layout, Line, Rect, Txt } from '@revideo/2d';
import {
  type Reference,
  type ReferenceArray,
  type ThreadGenerator,
  all,
  easeOutExpo,
  sequence,
} from '@revideo/core';
import { C, font, mono } from './components';

const tree: { text: string; depth: number; active?: boolean }[] = [
  { text: 'memory/', depth: 0 },
  { text: 'MEMORY.md', depth: 1 },
  { text: 'markets/', depth: 1 },
  { text: 'US.md', depth: 2 },
  { text: 'symbols/', depth: 1 },
  { text: 'MU.US.md', depth: 2 },
  { text: 'SMH.US.md', depth: 2, active: true },
  { text: 'notes/', depth: 1 },
];

const lines = [
  '# SMH.US',
  '- 2026-08-14: 只看日线，不做 5 分钟短线。',
  '- 2026-08-20: 回撤提醒设在 10%。',
];

export const newEntry = '- 2026-09-25: 回撤提醒改为 8%，替代 08-20 那条。';

const SLIDE = 36;

export function MemoryPanel({
  rows,
  activeRow,
  typed,
  typedGlow,
  newTag,
}: {
  rows: ReferenceArray<Txt>;
  activeRow: Reference<Rect>;
  typed: Reference<Txt>;
  typedGlow: Reference<Rect>;
  newTag: Reference<Rect>;
}) {
  return (
    <Layout>
      <Rect x={-620} y={18} width={420} height={804} fill={'#0B0E10'} />
      <Line
        points={[
          [-410, -384],
          [-410, 420],
        ]}
        stroke={C.border}
        lineWidth={1}
      />
      <Rect
        ref={activeRow}
        x={-620}
        y={-300 + 6 * 64}
        width={420}
        height={56}
        fill={'#F7C84322'}
        opacity={0}
      />
      {tree.map((item, index) => (
        <Txt
          key={`tree-${item.text}`}
          ref={rows}
          offset={[-1, 0]}
          x={-790 + item.depth * 36 - SLIDE}
          y={-300 + index * 64}
          opacity={0}
          text={item.text}
          fontFamily={mono}
          fontSize={28}
          fill={item.active ? C.yellow : item.text.endsWith('/') ? C.dim : C.paper}
        />
      ))}

      <Txt
        ref={rows}
        offset={[-1, 0]}
        x={-360 - SLIDE}
        y={-320}
        opacity={0}
        text={'symbols/SMH.US.md'}
        fontFamily={mono}
        fontSize={26}
        fill={C.dim}
      />
      <Line
        points={[
          [-380, -276],
          [790, -276],
        ]}
        stroke={C.border}
        lineWidth={1}
      />
      {lines.map((line, index) => (
        <Txt
          key={`line-${index}`}
          ref={rows}
          offset={[-1, 0]}
          x={-360 - SLIDE}
          y={-200 + index * 84}
          opacity={0}
          text={line}
          fontFamily={index === 0 ? mono : font}
          fontSize={index === 0 ? 40 : 34}
          fontWeight={index === 0 ? 700 : 400}
          fill={C.paper}
        />
      ))}
      <Rect
        ref={typedGlow}
        offset={[-1, 0]}
        x={-380}
        y={-200 + 3 * 84}
        width={1160}
        height={68}
        fill={'#F7C84318'}
        stroke={C.yellow}
        lineWidth={1}
        opacity={0}
        shadowColor={C.yellow}
        shadowBlur={0}
      />
      <Txt
        ref={typed}
        offset={[-1, 0]}
        x={-360}
        y={-200 + 3 * 84}
        text={''}
        fontFamily={font}
        fontSize={34}
        fontWeight={600}
        fill={C.yellow}
      />
      <Rect
        ref={newTag}
        x={700}
        y={-200 + 3 * 84}
        padding={[6, 14]}
        radius={4}
        layout
        fill={C.yellow}
        opacity={0}
        scale={0.6}
      >
        <Txt text={'新增'} fontFamily={font} fontSize={22} fontWeight={700} fill={C.bg} />
      </Rect>
    </Layout>
  );
}

export function slideRowsIn(rows: ReferenceArray<Txt>): ThreadGenerator {
  return sequence(
    0.06,
    ...[...rows].map((row) => all(row.opacity(1, 0.4), row.x(row.x() + SLIDE, 0.6, easeOutExpo))),
  );
}
