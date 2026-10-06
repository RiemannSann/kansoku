// A 股分时图：一分钟一个点，横轴固定 240 分钟。
//
// 两路数据合在一起：
// - 米筐 1 分钟线（每分钟重拉）：已经走完的分钟以它为准，成交额 ÷ 成交量就是同花顺的均价线；
// - 3 秒快照（实时）：当前这一分钟的价格、累计量和累计额，接在分钟线后面。
// 当天分钟线取不到时（license 不给当天分钟线），只能从 App 打开那一刻起用快照拼，标成 partial。
import type { RawBar, Timeshare, TimesharePoint } from '@kansoku/shared/types';
import { cnSessionSlot, shanghaiDate } from '../marketdata/ricequantTime.js';

/** 快照在某一分钟里最后一次看到的状态（累计量 / 累计额是当天从开盘起的总数） */
export interface TimeshareMark {
  slot: number;
  price: number;
  cumVolume: number;
  cumTurnover: number;
}

export interface TimeshareLive {
  /** 快照所在的北京日期 */
  date: string;
  prevClose: number | null;
  marks: TimeshareMark[];
  asOf: string | null;
}

export interface TimeshareInput {
  symbol: string;
  /** 1 分钟线，可以跨好几天，只取最新那天 */
  bars: RawBar[];
  /** 某天的前一个交易日收盘价（来自日线） */
  prevCloseFor: (date: string) => number | null;
  live: TimeshareLive | null;
}

const num = (v: string | number | undefined) => Number(v ?? 0);

export function buildTimeshare({ symbol, bars, prevCloseFor, live }: TimeshareInput): Timeshare {
  const dated = bars
    .map((bar) => ({ bar, ts: Date.parse(bar.time) }))
    .filter(({ ts }) => Number.isFinite(ts))
    .map(({ bar, ts }) => ({ bar, ts, date: shanghaiDate(ts), slot: cnSessionSlot(ts) }));
  const barDate = dated.reduce<string | null>(
    (d, b) => (d == null || b.date > d ? b.date : d),
    null,
  );
  const date = [barDate, live?.date]
    .filter((d): d is string => d != null)
    .sort()
    .at(-1);
  if (!date) return { symbol, date: '', prevClose: null, points: [], partial: false, asOf: null };

  const dayBars = dated
    .filter((b): b is typeof b & { slot: number } => b.date === date && b.slot != null)
    .sort((a, b) => a.ts - b.ts);
  // 没成交的分钟（收盘集合竞价那几分钟、冷门票）量额都是 0，不影响口径
  const exact =
    dayBars.length > 0 &&
    dayBars.every(({ bar }) => (bar.turnover ?? 0) > 0 || num(bar.volume) === 0);

  const points: TimesharePoint[] = [];
  // cum[slot] = 到这一分钟为止的累计量，给实时那一分钟算增量用
  const cumAfter = new Map<number, number>();
  let cumVolume = 0;
  let cumTurnover = 0;
  for (const { bar, slot } of dayBars) {
    const volume = num(bar.volume);
    const close = num(bar.close);
    cumVolume += volume;
    cumTurnover += exact
      ? (bar.turnover ?? 0)
      : ((num(bar.high) + num(bar.low) + close) / 3) * volume;
    const point = {
      slot,
      price: close,
      avg: cumVolume > 0 ? cumTurnover / cumVolume : null,
      volume,
    };
    if (points.at(-1)?.slot === slot)
      points[points.length - 1] = { ...point, volume: points.at(-1)!.volume + volume };
    else points.push(point);
    cumAfter.set(slot, cumVolume);
  }

  const lastBarSlot = points.at(-1)?.slot ?? -1;
  const cumBefore = (slot: number) => {
    let best = 0;
    for (const [s, cum] of cumAfter) if (s < slot && cum > best) best = cum;
    return best;
  };

  let partial = false;
  if (live && live.date === date) {
    const trades = live.marks
      .filter((m) => m.cumVolume > 0 && m.slot >= lastBarSlot)
      .sort((a, b) => a.slot - b.slot);
    // 当天一根分钟线都没有、快照又是开盘后才开始看的：前面那段走势缺了，第一分钟的量也没法算
    partial = dayBars.length === 0 && trades.length > 0 && trades[0].slot > 0;
    let prevCum: number | null = dayBars.length || trades[0]?.slot === 0 ? null : -1;
    for (const mark of trades) {
      const before = prevCum === -1 ? mark.cumVolume : (prevCum ?? cumBefore(mark.slot));
      const point: TimesharePoint = {
        slot: mark.slot,
        price: mark.price,
        avg: mark.cumTurnover > 0 ? mark.cumTurnover / mark.cumVolume : null,
        volume: Math.max(0, mark.cumVolume - before),
      };
      if (points.at(-1)?.slot === mark.slot) points[points.length - 1] = point;
      else points.push(point);
      prevCum = mark.cumVolume;
    }
  }

  return {
    symbol,
    date,
    prevClose:
      live && live.date === date ? (live.prevClose ?? prevCloseFor(date)) : prevCloseFor(date),
    points,
    partial,
    asOf: live && live.date === date ? live.asOf : (dayBars.at(-1)?.bar.time ?? null),
  };
}
