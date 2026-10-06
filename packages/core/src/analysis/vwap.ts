import type { LinePoint, RawBar } from '@kansoku/shared/types';
import { toTs } from './indicators.js';
import { marketDate } from '../marketdata/session.js';
import type { Market } from '../symbols/symbol.utils.js';

// Anchored per trading day in the symbol's own market (US: Eastern, extended
// hours included — matches how the chart displays ETH bars, so the line never
// jumps mid-view). A 股必须按北京日期：美东零点是北京中午，按美东算会在午休时把均价线清零。
export function sessionVwap(bars: RawBar[], market: Market = 'US'): LinePoint[] {
  const out: LinePoint[] = [];
  let day = '';
  let pv = 0;
  let vol = 0;
  for (const bar of bars) {
    const ts = toTs(bar.time);
    const d = marketDate(market, new Date(ts * 1000));
    if (d !== day) {
      day = d;
      pv = 0;
      vol = 0;
    }
    const h = Number(bar.high);
    const l = Number(bar.low);
    const c = Number(bar.close);
    const v = Number(bar.volume);
    if (![h, l, c, v].every(Number.isFinite) || v <= 0) {
      if (vol > 0) out.push({ time: ts, value: pv / vol });
      continue;
    }
    pv += ((h + l + c) / 3) * v;
    vol += v;
    out.push({ time: ts, value: pv / vol });
  }
  return out;
}

export function lastVwap(points: LinePoint[]): number | null {
  return points.length ? points.at(-1)!.value : null;
}
