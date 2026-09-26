import { Circle, type ComponentChildren, Img, Layout, Line, Rect, Txt } from '@revideo/2d';
import {
  type ReferenceArray,
  type ThreadGenerator,
  all,
  createRef,
  createRefArray,
  createSignal,
  delay,
  easeInCubic,
  easeInOutCubic,
  easeOutBack,
  easeOutExpo,
  linear,
  sequence,
} from '@revideo/core';
import { C, font, mono } from '../components';
import { amdBars, amdHistoryBars } from '../full/data';
import { shake } from './fx';

interface Region {
  x: number;
  y: number;
  w: number;
}

const H = (region: Region) => (region.w * 1080) / 1920;
const pt = (region: Region, dx: number, dy: number) => ({
  x: ((dx - region.x) / region.w) * 1920 - 960,
  y: ((dy - region.y) / H(region)) * 1080 - 540,
});

function Crop({ src, region, opacity = 1 }: { src: string; region: Region; opacity?: number | (() => number) }) {
  const k = 1920 / region.w;
  return (
    <Img
      src={src}
      width={2000 * k}
      x={(1000 - (region.x + region.w / 2)) * k}
      y={(625 - (region.y + H(region) / 2)) * k}
      opacity={opacity}
    />
  );
}

function Tick({ x, y, refs }: { x: number; y: number; refs: ReferenceArray<Layout> }) {
  return (
    <Layout ref={refs} x={x} y={y} scale={0}>
      <Circle size={46} fill={C.yellow} />
      <Line
        points={[
          [-11, 1],
          [-3, 9],
          [12, -9],
        ]}
        stroke={C.bg}
        lineWidth={6}
        lineCap={'round'}
        lineJoin={'round'}
      />
    </Layout>
  );
}

export interface Shot {
  word: string;
  sub: string;
  side: 'left' | 'right';
  media: ComponentChildren;
  over?: ComponentChildren;
  animate: (duration: number) => ThreadGenerator;
}

export function buildShots(): Shot[] {
  return [verify(), periods(), check(), scenarios(), canvas(), watch(), record(), train()];
}

function verify(): Shot {
  const region = { x: 40, y: 300, w: 1450 };
  const ticks = createRefArray<Layout>();
  const media = <Crop src={'/captures/full/verify-answer.webp'} region={region} />;
  const over = (
    <>
      {[921, 962, 1002].map((dy) => {
        const p = pt(region, 508, dy);
        return <Tick x={p.x} y={p.y} refs={ticks} />;
      })}
    </>
  );
  return {
    word: '核实',
    sub: '传闻？回原文查',
    side: 'left',
    media,
    over,
    animate: () =>
      delay(0.3, sequence(0.14, ...[...ticks].map((tick) => tick.scale(1, 0.35, easeOutBack)))),
  };
}

function periods(): Shot {
  const region = { x: 0, y: 50, w: 1530 };
  const step = createSignal(0);
  const srcs = ['5m', '15m', '1h', '1d'].map((p) => `/captures/full/chart-${p}.webp`);
  const media = (
    <>
      {srcs.map((src, index) => (
        <Crop src={src} region={region} opacity={() => (Math.floor(step()) === index ? 1 : 0)} />
      ))}
    </>
  );
  return {
    word: '周期',
    sub: '5 分钟到日线',
    side: 'right',
    media,
    animate: (duration) => step(3.99, duration * 0.9, linear),
  };
}

function check(): Shot {
  const region = { x: 700, y: 250, w: 1300 };
  const a = pt(region, 1550, 305);
  const b = pt(region, 1978, 475);
  const stamp = createRef<Rect>();
  const ticks = createRefArray<Layout>();
  const root = createRef<Layout>();
  const media = (
    <Layout ref={root}>
      <Crop src={'/captures/full/sepa.webp'} region={region} />
      {[745, 818, 890, 965].map((dy) => {
        const p = pt(region, 1573, dy);
        return <Tick x={p.x} y={p.y} refs={ticks} />;
      })}
      <Rect
        ref={stamp}
        x={(a.x + b.x) / 2}
        y={(a.y + b.y) / 2}
        width={b.x - a.x + 36}
        height={b.y - a.y + 36}
        radius={14}
        stroke={C.yellow}
        lineWidth={8}
        opacity={0}
        scale={1.6}
      />
    </Layout>
  );
  return {
    word: '检查',
    sub: '八条硬检查',
    side: 'left',
    media,
    animate: () =>
      all(
        sequence(0.08, ...[...ticks].map((tick) => tick.scale(1, 0.3, easeOutBack))),
        delay(
          0.5,
          all(stamp().opacity(1, 0.14), stamp().scale(1, 0.18, easeInCubic), delay(0.18, shake(root(), 14, 0.2))),
        ),
      ),
  };
}

function scenarios(): Shot {
  const region = { x: 700, y: 480, w: 1300 };
  const bars = [
    { pct: 50, color: C.yellow },
    { pct: 30, color: C.teal },
    { pct: 20, color: C.red },
  ];
  const fills = createRefArray<Rect>();
  const media = <Crop src={'/captures/full/chart-1d.webp'} region={region} />;
  const over = (
    <>
      <Layout x={-870} y={230}>
        {bars.map((bar, index) => (
          <>
            <Rect x={250} y={index * 34} width={500} height={16} radius={8} fill={'#FFFFFF14'} />
            <Rect ref={fills} offset={[-1, 0]} y={index * 34} width={0} height={16} radius={8} fill={bar.color} />
          </>
        ))}
      </Layout>
    </>
  );
  return {
    word: '情景',
    sub: '50 / 30 / 20',
    side: 'left',
    media,
    over,
    animate: () =>
      sequence(0.1, ...[...fills].map((fill, index) => fill.width(bars[index].pct * 10, 0.5, easeOutExpo))),
  };
}

function canvas(): Shot {
  const region = { x: 975, y: 440, w: 1025 };
  const move = createSignal(5);
  const frames = Array.from({ length: 16 }, (_, index) => index + 5);
  const media = (
    <>
      {frames.map((frame) => (
        <Crop
          src={`/captures/full/slider/s${String(frame).padStart(2, '0')}.webp`}
          region={region}
          opacity={() => (Math.round(move()) === frame ? 1 : 0)}
        />
      ))}
    </>
  );
  return {
    word: '画布',
    sub: '一句话画张图',
    side: 'left',
    media,
    animate: (duration) => move(20, duration * 0.85, easeInOutCubic),
  };
}

function watch(): Shot {
  const region = { x: 700, y: 60, w: 1300 };
  const note = createRef<Layout>();
  const media = <Crop src={'/captures/full/watch.webp'} region={region} />;
  const over = (
    <Layout ref={note} x={1400} y={-250}>
      <Rect width={660} height={150} radius={26} fill={'#1B1F24F5'} stroke={C.yellow} lineWidth={2} />
      <Img x={-262} src={'/brand/kansoku-icon.png'} width={92} />
      <Txt x={-200} y={-28} offset={[-1, 0]} text={'Kansoku · MU.US  15:37'} fontFamily={mono} fontSize={24} fill={C.dim} />
      <Txt x={-200} y={20} offset={[-1, 0]} text={'跌破前日高点 1081.04'} fontFamily={font} fontSize={40} fontWeight={700} fill={C.paper} />
    </Layout>
  );
  return {
    word: '盯盘',
    sub: '关了图还在盯',
    side: 'left',
    media,
    over,
    animate: () => delay(0.15, note().x(130, 0.45, easeOutExpo)),
  };
}

function record(): Shot {
  const region = { x: 700, y: 519, w: 1300 };
  const a = pt(region, 1386, 790);
  const b = pt(region, 1745, 790);
  const underline = createRef<Line>();
  const media = (
    <>
      <Crop src={'/captures/full/memory.webp'} region={region} />
      <Line
        ref={underline}
        points={[
          [a.x, a.y],
          [b.x, b.y],
        ]}
        stroke={C.yellow}
        lineWidth={7}
        lineCap={'round'}
        end={0}
      />
    </>
  );
  return {
    word: '留痕',
    sub: '研究落成文件',
    side: 'left',
    media,
    animate: () => delay(0.2, underline().end(1, 0.45, easeOutExpo)),
  };
}

function train(): Shot {
  const plot = { left: -120, right: 880, top: -300, bottom: 300 };
  const low = Math.min(...amdBars.map((bar) => bar[2]));
  const high = Math.max(...amdBars.map((bar) => bar[1]));
  const step = (plot.right - plot.left) / amdBars.length;
  const bx = (index: number) => plot.left + step * (index + 0.5);
  const by = (price: number) => plot.bottom - ((price - low) / (high - low)) * (plot.bottom - plot.top);
  const split = bx(amdHistoryBars - 1) + step / 2;
  const reveal = createSignal(0);
  const edge = () => split + (plot.right + 20 - split) * reveal();
  const media = (
    <>
      <Rect width={1920} height={1080} fill={'#0B0D10'} />
      {amdBars.map(([open, hi, lo, close], index) => (
        <>
          <Line
            points={[
              [bx(index), by(hi)],
              [bx(index), by(lo)],
            ]}
            stroke={close >= open ? C.teal : C.red}
            lineWidth={1.4}
          />
          <Rect
            x={bx(index)}
            y={(by(open) + by(close)) / 2}
            width={step * 0.7}
            height={Math.max(1.4, Math.abs(by(open) - by(close)))}
            fill={close >= open ? C.teal : C.red}
          />
        </>
      ))}
      <Rect
        offset={[-1, 0]}
        x={edge}
        width={() => plot.right + 40 - edge()}
        height={plot.bottom - plot.top + 60}
        fill={'#16191D'}
      />
      <Line
        points={() => [
          [edge(), plot.top - 30],
          [edge(), plot.bottom + 30],
        ]}
        stroke={C.yellow}
        lineWidth={4}
      />
    </>
  );
  return {
    word: '训练',
    sub: '遮住答案练',
    side: 'left',
    media,
    animate: (duration) => delay(0.1, reveal(1, duration * 0.8, easeInOutCubic)),
  };
}
