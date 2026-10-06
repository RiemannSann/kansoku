import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { RawBar } from '@kansoku/shared/types';
import { prevDayLevels, regularRange } from '../src/analysis/dayLevels.js';
import { sessionVwap } from '../src/analysis/vwap.js';
import { pushFreshWindowMs } from '../src/realtime/charts.js';
import { cnCacheFresh, parseShanghai, rqBarTime } from '../src/marketdata/ricequantTime.js';

// A 股的"当天"按北京日期算：美东零点是北京 12:00（夏令时）/ 13:00（冬令时），
// 以前按美东日期算时，均价线会在午休时清零、"昨收"在下午会取成今天。

type BarRow = [string, number, number, number, number, number, number];
const FIXTURE = JSON.parse(
  gunzipSync(
    readFileSync(
      path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        'fixtures',
        'rq-replay-2026-09-30.json.gz',
      ),
    ),
  ).toString('utf8'),
) as {
  day: string;
  symbols: Record<
    string,
    { bars_1m: BarRow[]; day_bar: { volume: number; total_turnover: number } }
  >;
};

function oneMinuteBars(symbol: string, day = FIXTURE.day): RawBar[] {
  return FIXTURE.symbols[symbol].bars_1m.map(([t, open, high, low, close, volume]) => ({
    time: rqBarTime(`${day} ${t}:00`, '1m'),
    open,
    high,
    low,
    close,
    volume,
  }));
}

const ts = (label: string) => Math.floor(parseShanghai(label) / 1000);

describe('CN session anchoring', () => {
  it('keeps the A-share average-price line running through the lunch break', () => {
    const symbol = '600519.SH';
    const vwap = sessionVwap(oneMinuteBars(symbol), 'CN');
    const at = (label: string) => vwap.find((p) => p.time === ts(`${FIXTURE.day} ${label}`))!;
    const morning = at('11:29:00').value;
    const afternoon = at('13:00:00').value;
    // 13:00 这根只多了一分钟的量，均价线不应该跳
    expect(Math.abs(afternoon - morning) / morning).toBeLessThan(0.002);
    // 收盘时的均价应接近交易所口径：全天成交额 ÷ 成交量
    const day = FIXTURE.symbols[symbol].day_bar;
    const exchangeAvg = day.total_turnover / day.volume;
    expect(Math.abs(vwap.at(-1)!.value - exchangeAvg) / exchangeAvg).toBeLessThan(0.002);
  });

  it('uses bar turnover when present, so the close matches turnover ÷ volume exactly', () => {
    const symbol = '688330.SH';
    const bars = FIXTURE.symbols[symbol].bars_1m.map(
      ([t, open, high, low, close, volume, turnover]): RawBar => ({
        time: rqBarTime(`${FIXTURE.day} ${t}:00`, '1m'),
        open,
        high,
        low,
        close,
        volume,
        ...(turnover > 0 ? { turnover } : {}),
      }),
    );
    const day = FIXTURE.symbols[symbol].day_bar;
    expect(sessionVwap(bars, 'CN').at(-1)!.value).toBeCloseTo(day.total_turnover / day.volume, 9);
  });

  it('resets the average-price line at the next Beijing trading day, not at US midnight', () => {
    const today = oneMinuteBars('000001.SZ');
    const next = oneMinuteBars('000001.SZ', '2026-10-08').map((bar) => ({
      ...bar,
      open: 20,
      high: 20,
      low: 20,
      close: 20,
    }));
    const vwap = sessionVwap([...today, ...next], 'CN');
    const firstNext = vwap.find((p) => p.time === ts('2026-10-08 09:30:00'))!;
    expect(firstNext.value).toBe(20);
    // 按美东日期会在北京 12:00 后清零；北京口径下 13:00 仍是上午延续下来的值
    const usAnchored = sessionVwap(today, 'US');
    const cnAt13 = vwap.find((p) => p.time === ts(`${FIXTURE.day} 13:00:00`))!.value;
    const usAt13 = usAnchored.find((p) => p.time === ts(`${FIXTURE.day} 13:00:00`))!.value;
    expect(cnAt13).not.toBeCloseTo(usAt13, 3);
  });

  it('picks yesterday’s daily bar as 昨收 even in the Beijing afternoon', () => {
    const dayBars: RawBar[] = [
      {
        time: rqBarTime('2026-09-30 00:00:00', 'day'),
        open: 1,
        high: 12,
        low: 1,
        close: 11.57,
        volume: 1,
      },
      {
        time: rqBarTime('2026-10-08 00:00:00', 'day'),
        open: 1,
        high: 99,
        low: 1,
        close: 50,
        volume: 1,
      },
    ];
    const afternoon = new Date(parseShanghai('2026-10-08 14:00:00'));
    expect(prevDayLevels(dayBars, afternoon, 'CN')?.close).toBe(11.57);
    const morning = new Date(parseShanghai('2026-10-08 10:00:00'));
    expect(prevDayLevels(dayBars, morning, 'CN')?.close).toBe(11.57);
  });

  it('finds today’s regular-session range on CN bars', () => {
    const bars = oneMinuteBars('600519.SH');
    const range = regularRange(bars, new Date(parseShanghai(`${FIXTURE.day} 15:30:00`)), 'CN');
    expect(range).toEqual({ high: 1268, low: 1236.05 });
  });
});

describe('CN cache freshness by session segment', () => {
  const at = (t: string, day = '2026-10-08') => parseShanghai(`${day} ${t}`);
  it('uses the short TTL during the session and the long one when quiet', () => {
    expect(cnCacheFresh(at('10:00:00'), at('10:00:50'), 60_000, 1_800_000)).toBe(true);
    expect(cnCacheFresh(at('10:00:00'), at('10:01:10'), 60_000, 1_800_000)).toBe(false);
    expect(cnCacheFresh(at('15:02:00'), at('15:25:00'), 60_000, 1_800_000)).toBe(true);
    expect(cnCacheFresh(at('12:00:00'), at('12:20:00'), 60_000, 1_800_000)).toBe(true);
  });

  it('expires the moment a session boundary is crossed', () => {
    expect(cnCacheFresh(at('15:00:30'), at('15:01:05'), 60_000, 1_800_000)).toBe(false);
    expect(cnCacheFresh(at('09:10:00'), at('09:15:01'), 60_000, 1_800_000)).toBe(false);
    expect(cnCacheFresh(at('11:30:50'), at('11:31:20'), 60_000, 1_800_000)).toBe(false);
    expect(cnCacheFresh(at('23:59:00', '2026-10-07'), at('00:01:00'), 60_000, 1_800_000)).toBe(
      false,
    );
  });

  it('gives CN charts a push-freshness window wider than the snapshot poll', () => {
    expect(pushFreshWindowMs('CN')).toBeGreaterThan(6_000);
    expect(pushFreshWindowMs('US')).toBe(3_000);
  });
});
