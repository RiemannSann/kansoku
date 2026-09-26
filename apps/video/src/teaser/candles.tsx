import { Layout, Line, Rect } from '@revideo/2d';
import type { SignalValue } from '@revideo/core';
import { C } from '../components';
import { muDaily } from './mu-daily';

export const PLOT = { left: -975, right: 395, top: -500, bottom: 300 };

const LOW = Math.min(...muDaily.map((bar) => bar[2]));
const HIGH = Math.max(...muDaily.map((bar) => bar[1]));
const STEP = (PLOT.right - PLOT.left) / muDaily.length;
const BODY = STEP * 0.72;

const bx = (index: number) => PLOT.left + STEP * (index + 0.5);
const by = (price: number) =>
  PLOT.bottom - ((price - LOW) / (HIGH - LOW)) * (PLOT.bottom - PLOT.top);

export const HERO = muDaily.reduce(
  (best, bar, index) => (bar[3] - bar[0] > muDaily[best][3] - muDaily[best][0] ? index : best),
  0,
);

export const heroPoint = {
  x: bx(HERO),
  y: (by(muDaily[HERO][1]) + by(muDaily[HERO][2])) / 2,
  h: by(muDaily[HERO][2]) - by(muDaily[HERO][1]),
};

export function Candles({
  others,
  glow,
  trail,
}: {
  others: SignalValue<number>;
  glow: SignalValue<number>;
  trail: SignalValue<number>;
}) {
  return (
    <Layout>
      <Layout opacity={others}>
        {muDaily.map(([open, high, low, close], index) => {
          if (index === HERO) return null;
          const color = close >= open ? C.teal : C.red;
          return (
            <>
              <Line
                points={[
                  [bx(index), by(high)],
                  [bx(index), by(low)],
                ]}
                stroke={color}
                lineWidth={0.8}
              />
              <Rect
                x={bx(index)}
                y={(by(open) + by(close)) / 2}
                width={BODY}
                height={Math.max(0.8, Math.abs(by(open) - by(close)))}
                fill={color}
              />
            </>
          );
        })}
      </Layout>
      <Line
        points={muDaily.map((bar, index) => [bx(index), by(bar[3])])}
        stroke={C.yellow}
        lineWidth={2.5}
        end={trail}
        opacity={0.9}
      />
      <HeroCandle glow={glow} />
    </Layout>
  );
}

function HeroCandle({ glow }: { glow: SignalValue<number> }) {
  const [open, high, low, close] = muDaily[HERO];
  const x = bx(HERO);
  return (
    <>
      <Line
        points={[
          [x, by(high)],
          [x, by(low)],
        ]}
        stroke={'#9FFFF5'}
        lineWidth={0.5}
        shadowColor={C.teal}
        shadowBlur={glow}
      />
      <Rect
        x={x}
        y={(by(open) + by(close)) / 2}
        width={BODY}
        height={by(open) - by(close)}
        fill={C.teal}
        shadowColor={C.teal}
        shadowBlur={glow}
      />
    </>
  );
}
