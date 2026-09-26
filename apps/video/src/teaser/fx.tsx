import { Layout, Txt } from '@revideo/2d';
import { type SignalValue, type SimpleSignal, type ThreadGenerator, all, easeOutExpo } from '@revideo/core';
import { C, font } from '../components';

export function SplitText({
  text,
  split,
  fontSize,
  fill = C.paper,
  x = 0,
  y = 0,
  opacity = 1,
}: {
  text: string;
  split: SimpleSignal<number>;
  fontSize: number;
  fill?: string;
  x?: number;
  y?: number;
  opacity?: SignalValue<number>;
}) {
  const common = { text, fontSize, fontFamily: font, fontWeight: 900, letterSpacing: fontSize * 0.04 };
  return (
    <Layout x={x} y={y} opacity={opacity}>
      <Txt {...common} x={() => -split()} fill={C.red} opacity={() => Math.min(1, split() / 6)} />
      <Txt {...common} x={() => split()} fill={C.teal} opacity={() => Math.min(1, split() / 6)} />
      <Txt {...common} fill={fill} />
    </Layout>
  );
}

export function* slamIn(root: Layout, split: SimpleSignal<number>, duration = 0.35): ThreadGenerator {
  root.opacity(1);
  root.scale(1.35);
  split(34);
  yield* all(root.scale(1, duration, easeOutExpo), split(0, duration * 1.4, easeOutExpo));
}

export function* shake(target: Layout, strength = 18, duration = 0.24): ThreadGenerator {
  const steps = 6;
  for (let k = 0; k < steps; k++) {
    const decay = 1 - k / steps;
    const angle = k * 2.4;
    yield* target.position(
      [Math.cos(angle) * strength * decay, Math.sin(angle * 1.7) * strength * decay],
      duration / steps,
    );
  }
  yield* target.position(0, 0.04);
}
