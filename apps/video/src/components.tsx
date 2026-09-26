import { Layout, Line, Rect, Txt } from '@revideo/2d';
import type { SignalValue } from '@revideo/core';

export const C = {
  bg: '#080A0C',
  border: '#30353A',
  dim: '#7D878F',
  grid: '#1B2024',
  paper: '#E7ECEF',
  red: '#FF5B5B',
  teal: '#2BC3B4',
  yellow: '#F7C843',
};

export const font = 'PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif';
export const mono = 'DIN Alternate, SFMono-Regular, Menlo, monospace';

export function Grid({ opacity }: { opacity: SignalValue<number> }) {
  return (
    <Layout opacity={opacity}>
      {Array.from({ length: 17 }, (_, index) => (
        <Line
          key={`v-${index}`}
          points={[
            [-960 + index * 120, -540],
            [-960 + index * 120, 540],
          ]}
          stroke={C.grid}
          lineWidth={1}
        />
      ))}
      {Array.from({ length: 10 }, (_, index) => (
        <Line
          key={`h-${index}`}
          points={[
            [-960, -540 + index * 120],
            [960, -540 + index * 120],
          ]}
          stroke={C.grid}
          lineWidth={1}
        />
      ))}
    </Layout>
  );
}

export function Label({
  accent = C.yellow,
  code,
  text,
}: {
  accent?: string;
  code: string;
  text: string;
}) {
  return (
    <Layout layout direction={'row'} alignItems={'center'} gap={16}>
      <Rect width={8} height={8} fill={accent} />
      <Txt
        text={code}
        fontFamily={mono}
        fontSize={21}
        fontWeight={700}
        letterSpacing={3}
        fill={accent}
      />
      <Line
        points={[
          [0, 0],
          [68, 0],
        ]}
        stroke={C.border}
        lineWidth={1}
      />
      <Txt text={text} fontFamily={font} fontSize={23} fill={C.dim} />
    </Layout>
  );
}

export function Pill({ accent = C.teal, text }: { accent?: string; text: string }) {
  return (
    <Rect padding={[12, 20]} fill={'#0B0E10E8'} stroke={accent} lineWidth={1} radius={4}>
      <Txt text={text} fontFamily={font} fontSize={22} fontWeight={600} fill={C.paper} />
    </Rect>
  );
}

export function Corner({
  x,
  y,
  flipX = 1,
  flipY = 1,
}: {
  x: number;
  y: number;
  flipX?: number;
  flipY?: number;
}) {
  return (
    <Line
      position={[x, y]}
      points={[
        [0, 32 * flipY],
        [0, 0],
        [32 * flipX, 0],
      ]}
      stroke={C.yellow}
      lineWidth={2}
    />
  );
}
