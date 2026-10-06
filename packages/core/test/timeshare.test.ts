import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { RawBar } from '@kansoku/shared/types';
import { buildTimeshare, type TimeshareMark } from '../src/analysis/timeshare.js';
import { toRawBars } from '../src/marketdata/ricequant.js';
import { cnSessionSlot, parseShanghai } from '../src/marketdata/ricequantTime.js';
import { recordMark } from '../src/realtime/timeshare.js';

// 用 09-30 真实数据核对分时图：米筐官方 1 分钟线（含成交额）+ 3 秒快照
type TickRow = [string, number, number, number, number, number, number, number, number];
type BarRow = [string, number, number, number, number, number, number];
interface SymbolFixture {
  prev_close: number;
  ticks: TickRow[];
  bars_1m: BarRow[];
  day_bar: { close: number; volume: number; total_turnover: number };
}
const FIXTURE: { day: string; prev_day: string; symbols: Record<string, SymbolFixture> } =
  JSON.parse(
    gunzipSync(
      readFileSync(
        path.join(
          path.dirname(fileURLToPath(import.meta.url)),
          'fixtures',
          'rq-replay-2026-09-30.json.gz',
        ),
      ),
    ).toString('utf8'),
  );
const DAY = FIXTURE.day;
const SYMBOL = '600519.SH';
const fx = FIXTURE.symbols[SYMBOL];

function officialBars(until?: string): RawBar[] {
  return toRawBars(
    fx.bars_1m
      .filter(([t]) => until == null || t <= until)
      .map(([t, open, high, low, close, volume, turnover]) => ({
        t: `${DAY} ${t}:00`,
        open,
        high,
        low,
        close,
        volume,
        turnover,
      })),
    '1m',
  );
}

function marksFromTicks(from = '00:00:00'): TimeshareMark[] {
  const marks = new Map<number, TimeshareMark>();
  for (const [t, last, , , , volume, turnover] of fx.ticks) {
    if (t < from) continue;
    const slot = cnSessionSlot(parseShanghai(`${DAY} ${t}`));
    if (slot == null) continue;
    marks.set(slot, { slot, price: last, cumVolume: volume, cumTurnover: turnover });
  }
  return [...marks.values()];
}

const prevCloseFor = (date: string) => (date === DAY ? fx.prev_close : null);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('cnSessionSlot', () => {
  const slot = (clock: string) => cnSessionSlot(parseShanghai(`${DAY} ${clock}`));
  it('maps the trading day onto 240 minutes with lunch squeezed out', () => {
    expect(slot('09:14:59')).toBeNull();
    expect(slot('09:20:00')).toBe(0);
    expect(slot('09:25:01')).toBe(0);
    expect(slot('09:30:00')).toBe(0);
    expect(slot('09:31:00')).toBe(1);
    expect(slot('11:29:59')).toBe(119);
    expect(slot('11:30:02')).toBe(119);
    expect(slot('12:00:00')).toBeNull();
    expect(slot('13:00:03')).toBe(120);
    expect(slot('14:59:59')).toBe(239);
    expect(slot('15:00:03')).toBe(239);
    expect(slot('15:01:00')).toBeNull();
  });
});

describe('buildTimeshare (09-30 replay)', () => {
  it('official 1m bars give 240 points and the 同花顺 average (turnover ÷ volume)', () => {
    const ts = buildTimeshare({ symbol: SYMBOL, bars: officialBars(), prevCloseFor, live: null });
    expect(ts.date).toBe(DAY);
    expect(ts.prevClose).toBe(fx.prev_close);
    expect(ts.partial).toBe(false);
    expect(ts.points.map((p) => p.slot)).toEqual(Array.from({ length: 240 }, (_, i) => i));
    expect(sum(ts.points.map((p) => p.volume))).toBe(fx.day_bar.volume);
    const last = ts.points.at(-1)!;
    expect(last.price).toBe(fx.day_bar.close);
    expect(last.avg).toBeCloseTo(fx.day_bar.total_turnover / fx.day_bar.volume, 6);
  });

  it('without today’s 1m bars, snapshots from 09:15 rebuild the whole day', () => {
    const marks = marksFromTicks();
    const ts = buildTimeshare({
      symbol: SYMBOL,
      bars: [],
      prevCloseFor,
      live: { date: DAY, prevClose: fx.prev_close, marks, asOf: null },
    });
    expect(ts.partial).toBe(false);
    expect(ts.points[0].slot).toBe(0);
    expect(ts.points.at(-1)!.slot).toBe(239);
    const lastTick = fx.ticks.at(-1)!;
    expect(sum(ts.points.map((p) => p.volume))).toBe(lastTick[5]);
    expect(ts.points.at(-1)!.avg).toBeCloseTo(lastTick[6] / lastTick[5], 6);
    // 每分钟的量和官方 1 分钟线对得上（快照 3 秒一个，分钟边界最多差一个快照）
    const official = new Map(
      buildTimeshare({ symbol: SYMBOL, bars: officialBars(), prevCloseFor, live: null }).points.map(
        (p) => [p.slot, p.volume],
      ),
    );
    const close = ts.points.filter(
      (p) => Math.abs(p.volume - (official.get(p.slot) ?? 0)) <= 0.5 * (official.get(p.slot) ?? 0),
    );
    expect(close.length / ts.points.length).toBeGreaterThan(0.8);
  });

  it('opened mid-day without 1m bars: marked partial and no volume spike on the first point', () => {
    const marks = marksFromTicks('13:00:00');
    const ts = buildTimeshare({
      symbol: SYMBOL,
      bars: [],
      prevCloseFor,
      live: { date: DAY, prevClose: fx.prev_close, marks, asOf: null },
    });
    expect(ts.partial).toBe(true);
    expect(ts.points[0]).toMatchObject({ slot: 120, volume: 0 });
    const biggestOfficial = Math.max(...fx.bars_1m.map((b) => b[5]));
    expect(Math.max(...ts.points.map((p) => p.volume))).toBeLessThanOrEqual(biggestOfficial * 1.5);
  });

  it('1m bars up to 10:00 plus live snapshots continue seamlessly', () => {
    const marks = marksFromTicks('09:55:00');
    const ts = buildTimeshare({
      symbol: SYMBOL,
      bars: officialBars('10:00'),
      prevCloseFor,
      live: { date: DAY, prevClose: fx.prev_close, marks, asOf: null },
    });
    const slots = ts.points.map((p) => p.slot);
    expect(new Set(slots).size).toBe(slots.length);
    expect(slots).toEqual([...slots].sort((a, b) => a - b));
    expect(slots.at(-1)).toBe(239);
    expect(sum(ts.points.map((p) => p.volume))).toBe(fx.ticks.at(-1)![5]);
    expect(ts.points.find((p) => p.slot === 10)!.volume).toBe(fx.bars_1m[10][5]);
  });

  it('next morning in the auction: switches to the new day with an empty chart', () => {
    const ts = buildTimeshare({
      symbol: SYMBOL,
      bars: officialBars(),
      prevCloseFor,
      live: {
        date: '2026-10-08',
        prevClose: fx.day_bar.close,
        marks: [{ slot: 0, price: 1260, cumVolume: 0, cumTurnover: 0 }],
        asOf: '2026-10-08T01:20:00.000Z',
      },
    });
    expect(ts).toMatchObject({ date: '2026-10-08', prevClose: fx.day_bar.close, points: [] });
  });

  it('before the open the previous session stays on screen', () => {
    const ts = buildTimeshare({
      symbol: SYMBOL,
      bars: officialBars(),
      prevCloseFor,
      live: {
        date: DAY,
        prevClose: fx.prev_close,
        marks: [
          {
            slot: 239,
            price: fx.day_bar.close,
            cumVolume: fx.day_bar.volume,
            cumTurnover: fx.day_bar.total_turnover,
          },
        ],
        asOf: null,
      },
    });
    expect(ts.date).toBe(DAY);
    expect(ts.points).toHaveLength(240);
    expect(sum(ts.points.map((p) => p.volume))).toBe(fx.day_bar.volume);
  });
});

describe('recordMark', () => {
  it('keeps the latest quote per minute, resets on a new day and skips lunch', () => {
    const state = { liveDate: null as string | null, marks: new Map<number, TimeshareMark>() };
    const cell = (clock: string, last: number, volume: number) => ({
      symbol: SYMBOL,
      session: '日盘',
      last,
      pct: 0,
      regularLast: last,
      regularPct: 0,
      volume,
      turnover: volume * last,
      asOf: new Date(parseShanghai(clock)).toISOString(),
    });
    expect(recordMark(state, cell(`${DAY} 09:31:03`, 10, 100))).toBe(true);
    expect(recordMark(state, cell(`${DAY} 09:31:57`, 11, 200))).toBe(true);
    expect(recordMark(state, cell(`${DAY} 12:10:00`, 11, 200))).toBe(false);
    expect([...state.marks.values()]).toEqual([
      { slot: 1, price: 11, cumVolume: 200, cumTurnover: 2200 },
    ]);
    recordMark(state, cell('2026-10-08 09:20:00', 12, 0));
    expect(state.liveDate).toBe('2026-10-08');
    expect([...state.marks.keys()]).toEqual([0]);
  });
});
