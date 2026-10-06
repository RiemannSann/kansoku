import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { QuoteCell } from '@kansoku/shared/types';
import { formatMarketTick } from '@kansoku/shared/time';
import type { CandleBar, CandlePeriod } from '../src/marketdata/candleAggregator.js';
import type { BridgeSnapshot } from '../src/marketdata/ricequant.js';
import { RicequantStream } from '../src/marketdata/ricequantStream.js';
import { cnBucketStart, parseShanghai, rqBarTime } from '../src/marketdata/ricequantTime.js';

// 用 2026-09-30 一整天的真实 3 秒快照（米筐 get_ticks）回放 RicequantStream，
// 拿同一天米筐官方 1 分钟线当标准答案。生成脚本：packages/core/rq-bridge/build_replay_fixture.py
// 设 RQ_REPLAY_FIXTURE=<路径> 可以换成别的 fixture（比如 10-08 App 现场录下的快照），同一套断言再跑一遍。

type TickRow = [string, number, number, number, number, number, number, number, number];
type BarRow = [string, number, number, number, number, number, number];

interface SymbolFixture {
  prev_close: number;
  limit_up: number;
  limit_down: number;
  prev_day_last_tick: { t: string; last: number; volume: number; total_turnover: number };
  ticks: TickRow[];
  bars_1m: BarRow[];
  day_bar: { open: number; high: number; low: number; close: number; volume: number };
}

interface Fixture {
  day: string;
  prev_day: string;
  symbols: Record<string, SymbolFixture>;
}

const FIXTURE: Fixture = JSON.parse(
  gunzipSync(
    readFileSync(
      process.env.RQ_REPLAY_FIXTURE ||
        path.join(
          path.dirname(fileURLToPath(import.meta.url)),
          'fixtures',
          'rq-replay-2026-09-30.json.gz',
        ),
    ),
  ).toString('utf8'),
);
const DAY = FIXTURE.day;
const PERIODS: CandlePeriod[] = ['5m', '15m', '60m'];
const PERIOD_MIN: Record<CandlePeriod, number> = { '5m': 5, '15m': 15, '60m': 60 };
const at = (clock: string, day = DAY) => parseShanghai(`${day} ${clock}`);

function snapshotOf(symbol: string, row: TickRow): BridgeSnapshot {
  const fx = FIXTURE.symbols[symbol];
  const [t, last, open, high, low, volume, turnover, a1, b1] = row;
  return {
    symbol,
    datetime: `${DAY} ${t}`,
    last,
    prev_close: fx.prev_close,
    open,
    high,
    low,
    volume,
    turnover,
    limit_up: fx.limit_up,
    limit_down: fx.limit_down,
    asks: [a1],
    bids: [b1],
  };
}

function prevDaySnapshot(symbol: string): BridgeSnapshot {
  const prev = FIXTURE.symbols[symbol].prev_day_last_tick;
  return {
    symbol,
    datetime: prev.t,
    last: prev.last,
    prev_close: prev.last,
    open: prev.last,
    high: prev.last,
    low: prev.last,
    volume: prev.volume,
    turnover: prev.total_turnover,
  };
}

interface OfficialBar {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** 官方 1 分钟线（收盘时刻标签）聚合成 kansoku 口径（开盘时刻）的 N 分钟线 */
function officialBars(symbol: string, period: CandlePeriod): Map<number, OfficialBar> {
  const out = new Map<number, OfficialBar>();
  for (const [label, open, high, low, close, volume] of FIXTURE.symbols[symbol].bars_1m) {
    const minuteStart = Date.parse(rqBarTime(`${DAY} ${label}:00`, '1m'));
    const ts = cnBucketStart(minuteStart, PERIOD_MIN[period]);
    const cur = out.get(ts);
    if (!cur) out.set(ts, { ts, open, high, low, close, volume });
    else {
      cur.high = Math.max(cur.high, high);
      cur.low = Math.min(cur.low, low);
      cur.close = close;
      cur.volume += volume;
    }
  }
  return out;
}

interface Replay {
  stream: RicequantStream;
  /** 每个周期每根 bar 最后一次推送的样子 */
  bars: Record<CandlePeriod, Map<number, CandleBar>>;
  /** 每次推送的 bar（按顺序） */
  pushes: Record<CandlePeriod, CandleBar[]>;
  quotes: QuoteCell[];
  feed: (snap: BridgeSnapshot, nowMs?: number) => Promise<void>;
}

async function startReplay(symbol: string): Promise<Replay> {
  let current: BridgeSnapshot[] = [];
  let clock = at('09:10:00');
  const stream = new RicequantStream({
    fetchSnapshots: async () => current,
    fetchSeed: async () => undefined,
    now: () => clock,
    schedule: () => setTimeout(() => {}, 0),
    cancel: () => {},
  });
  const bars = {} as Replay['bars'];
  const pushes = {} as Replay['pushes'];
  for (const period of PERIODS) {
    bars[period] = new Map();
    pushes[period] = [];
    stream.subscribeCandlesticks(symbol, period, (bar) => {
      bars[period].set(bar.ts, bar);
      pushes[period].push(bar);
    });
  }
  const quotes: QuoteCell[] = [];
  stream.onUpdate((cell) => quotes.push(cell));
  const feed = async (snap: BridgeSnapshot, nowMs?: number) => {
    current = [snap];
    clock = nowMs ?? parseShanghai(snap.datetime) + 500;
    await stream.poll();
  };
  return { stream, bars, pushes, quotes, feed };
}

async function replayDay(
  symbol: string,
  options: { prevDay?: boolean; pollSeconds?: number } = {},
): Promise<Replay> {
  const replay = await startReplay(symbol);
  if (options.prevDay) await replay.feed(prevDaySnapshot(symbol), at('09:10:00'));
  const ticks = FIXTURE.symbols[symbol].ticks;
  if (!options.pollSeconds) {
    for (const row of ticks) await replay.feed(snapshotOf(symbol, row));
    return replay;
  }
  // 像真实轮询一样：每隔 pollSeconds 秒问一次，拿到的是那一刻最新的快照（中间的会漏掉）
  const times = ticks.map(([t]) => at(t));
  let idx = -1;
  for (let clock = at('09:14:00'); clock <= at('15:02:00'); clock += options.pollSeconds * 1000) {
    while (idx + 1 < times.length && times[idx + 1] <= clock - 300) idx++;
    if (idx >= 0) await replay.feed(snapshotOf(symbol, ticks[idx]), clock);
  }
  return replay;
}

const SYMBOLS = Object.keys(FIXTURE.symbols);

describe('ricequant replay 2026-09-30: open auction 09:15–09:25', () => {
  it.each(SYMBOLS)('%s: auction snapshots never open a bar', async (symbol) => {
    const replay = await startReplay(symbol);
    const ticks = FIXTURE.symbols[symbol].ticks;
    const auction = ticks.filter(([t]) => t < '09:25:00');
    expect(auction.length).toBeGreaterThan(10);
    // 竞价阶段快照：last = 昨收，量 = 0（这是米筐快照的真实样子，见 fixture）
    expect(
      auction.every(
        ([, last, , , , volume]) => last === FIXTURE.symbols[symbol].prev_close && volume === 0,
      ),
    ).toBe(true);
    for (const row of auction) await replay.feed(snapshotOf(symbol, row));
    for (const period of PERIODS) expect(replay.pushes[period]).toEqual([]);
  });

  it.each(SYMBOLS)(
    '%s: the first bar opens at the 09:25 match price, not prev close',
    async (symbol) => {
      const replay = await replayDay(symbol);
      for (const period of PERIODS) {
        const official = officialBars(symbol, period).get(at('09:30:00'))!;
        const first = replay.bars[period].get(at('09:30:00'))!;
        expect(first.open).toBe(official.open);
        expect(first.low).toBeGreaterThanOrEqual(official.low);
        expect(first.high).toBeLessThanOrEqual(official.high);
      }
    },
  );

  it('shows the indicative auction price (bid1 = ask1) in the quote, flagged as 集合竞价', async () => {
    const symbol = SYMBOLS[0];
    const replay = await startReplay(symbol);
    const row = [...FIXTURE.symbols[symbol].ticks]
      .reverse()
      .find(
        ([t, , , , , volume, , a1, b1]) => t < '09:25:00' && volume === 0 && a1 > 0 && a1 === b1,
      )!;
    await replay.feed(snapshotOf(symbol, row));
    const cell = replay.quotes.at(-1)!;
    expect(row[7]).toBe(row[8]);
    expect(cell.last).toBe(row[7]);
    expect(cell.session).toBe('集合竞价');
    expect(cell.pct).toBeCloseTo((row[7] / FIXTURE.symbols[symbol].prev_close - 1) * 100, 6);
  });
});

describe('ricequant replay 2026-09-30: bars land only inside trading sessions', () => {
  it.each(SYMBOLS)('%s: every synthesized bar start is an exchange bucket', async (symbol) => {
    const replay = await replayDay(symbol);
    for (const period of PERIODS) {
      const official = officialBars(symbol, period);
      const starts = [...replay.bars[period].keys()];
      for (const ts of starts) expect(official.has(ts), new Date(ts).toISOString()).toBe(true);
      for (const ts of starts) {
        expect(ts < at('11:30:00') || ts >= at('13:00:00')).toBe(true);
        expect(ts).toBeLessThan(at('15:00:00'));
      }
    }
    expect(replay.bars['60m'].size).toBe(4);
    expect([...replay.bars['60m'].keys()]).toEqual(
      ['09:30', '10:30', '13:00', '14:00'].map((t) => at(`${t}:00`)),
    );
  });

  it('the last morning snapshot (11:30:0x) belongs to the 11:25 bar and lunch polls change nothing', async () => {
    const symbol = SYMBOLS[0];
    const replay = await startReplay(symbol);
    const ticks = FIXTURE.symbols[symbol].ticks.filter(([t]) => t < '11:31:00');
    for (const row of ticks) await replay.feed(snapshotOf(symbol, row));
    const lunchSnap = snapshotOf(symbol, ticks.at(-1)!);
    expect(lunchSnap.datetime.slice(11, 16)).toBe('11:30');
    expect([...replay.bars['5m'].keys()].at(-1)).toBe(at('11:25:00'));
    const before = PERIODS.map((p) => replay.pushes[p].length);
    // 午休 90 分钟里每分钟一轮（盘外节奏），米筐一直返回上午最后那个快照
    for (let m = 31; m < 120; m++) {
      const clock = at('11:30:00') + m * 60_000;
      await replay.feed(lunchSnap, clock);
    }
    expect(PERIODS.map((p) => replay.pushes[p].length)).toEqual(before);
  });

  it('labels bars on the Beijing-time axis', async () => {
    const replay = await replayDay(SYMBOLS[0]);
    const labels = [...replay.bars['15m'].keys()].map((ts) =>
      formatMarketTick(Math.floor(ts / 1000), 3, 'CN'),
    );
    expect(labels[0]).toBe('09:30');
    expect(labels).toContain('11:15');
    expect(labels).toContain('13:00');
    expect(labels.at(-1)).toBe('14:45');
    expect(labels).not.toContain('11:30');
    expect(labels).not.toContain('12:00');
  });
});

describe('ricequant replay 2026-09-30: 15:00 close freezes the day', () => {
  it.each(SYMBOLS)(
    '%s: the last bar closes at the official close with the full day volume',
    async (symbol) => {
      const replay = await replayDay(symbol);
      const fx = FIXTURE.symbols[symbol];
      for (const period of PERIODS) {
        const list = [...replay.bars[period].values()];
        const last = list.at(-1)!;
        expect(last.close).toBe(fx.day_bar.close);
        const total = list.reduce((sum, bar) => sum + bar.volume, 0);
        expect(total).toBe(fx.day_bar.volume);
      }
    },
  );

  it('later polls (same snapshot, or an after-hours one with more volume) do not move any bar', async () => {
    const symbol = SYMBOLS.at(-1)!;
    const replay = await replayDay(symbol);
    const before = PERIODS.map((p) => replay.pushes[p].length);
    const closing = snapshotOf(symbol, FIXTURE.symbols[symbol].ticks.at(-1)!);
    for (let m = 1; m <= 30; m++) await replay.feed(closing, at('15:00:00') + m * 60_000);
    // 科创板/创业板 15:05–15:30 有盘后固定价格交易，累计量还会涨，但不属于任何一根 K 线
    await replay.feed({ ...closing, datetime: `${DAY} 15:10:03`, volume: closing.volume + 5000 });
    expect(PERIODS.map((p) => replay.pushes[p].length)).toEqual(before);
    // 报价还是要跟上（显示"已收盘"）
    expect(replay.quotes.at(-1)!.session).toBe('休市');
  });
});

describe('ricequant replay 2026-09-30: synthesized bars vs exchange bars', () => {
  it.each(SYMBOLS)('%s: 5m bars track the official bars', async (symbol) => {
    const replay = await replayDay(symbol);
    const official = officialBars(symbol, '5m');
    const synth = replay.bars['5m'];
    // 有成交的 5 分钟桶都要有 bar
    for (const [ts, bar] of official) if (bar.volume > 0) expect(synth.has(ts)).toBe(true);
    let closeHits = 0;
    let volumeHits = 0;
    for (const [ts, bar] of synth) {
      const ref = official.get(ts)!;
      // 快照只抽到部分成交价，区间只会更窄；边界上差一个快照（3 秒）的价允许 0.3% 误差
      expect(bar.high).toBeLessThanOrEqual(ref.high * 1.003);
      expect(bar.low).toBeGreaterThanOrEqual(ref.low * 0.997);
      if (Math.abs(bar.close - ref.close) <= ref.close * 0.001) closeHits++;
      if (Math.abs(bar.volume - ref.volume) <= Math.max(ref.volume * 0.1, 1000)) volumeHits++;
    }
    expect(closeHits / synth.size).toBeGreaterThan(0.8);
    expect(volumeHits / synth.size).toBeGreaterThan(0.75);
  });

  it.each(SYMBOLS)(
    '%s: polling every 3 s (missing some snapshots) keeps the same invariants',
    async (symbol) => {
      const replay = await replayDay(symbol, { pollSeconds: 3 });
      const fx = FIXTURE.symbols[symbol];
      for (const period of PERIODS) {
        const list = [...replay.bars[period].values()];
        expect(list.reduce((sum, bar) => sum + bar.volume, 0)).toBe(fx.day_bar.volume);
        expect(list.at(-1)!.close).toBe(fx.day_bar.close);
        expect(list[0].open).toBe(fx.day_bar.open);
      }
    },
  );

  it.each(SYMBOLS)(
    '%s: carrying yesterday’s snapshot over does not leak its volume into today',
    async (symbol) => {
      const replay = await replayDay(symbol, { prevDay: true });
      const fx = FIXTURE.symbols[symbol];
      for (const period of PERIODS) {
        const list = [...replay.bars[period].values()].filter((bar) => bar.ts >= at('09:00:00'));
        expect(list.reduce((sum, bar) => sum + bar.volume, 0)).toBe(fx.day_bar.volume);
      }
    },
  );
});
