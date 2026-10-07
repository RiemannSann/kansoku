import type { IntradayTfData, KlineAdjust, RawBar } from '@kansoku/shared/types';
import { ClientError } from '../platform/errors.js';
import { MACD_MIN_BARS } from '../analysis/intraday/constants.js';
import { buildTimeframeView } from '../analysis/intraday/orchestrator.js';
import { coerceIntradayTimeframe } from '../analysis/intraday/timeframe.js';
import { getProvider } from '../marketdata/registry.js';
import { cnCacheFresh } from '../marketdata/ricequantTime.js';
import { marketOf } from '../symbols/symbol.utils.js';

export const VIEW_PERIODS = ['1m', '30m', 'day', 'week', 'month'] as const;
export type ViewPeriod = (typeof VIEW_PERIODS)[number];

const DEFAULT_COUNT = 1000;
const MAX_COUNT = 2000;
const CACHE_TTL_MS = 5_000;
const CACHE_MAX_ENTRIES = 48;
// A 股：盘中分钟周期 5 秒、日/周/月 60 秒；不开盘的时段行情不动，半小时（跨开收盘立刻失效）。
// 前端每 15 秒来要一次，不加这层的话月线会每 15 秒把全部历史日线重拉一遍。
const CN_DAILY_TTL_MS = 60_000;
const CN_QUIET_TTL_MS = 30 * 60_000;
const INTRADAY_VIEW = new Set<string>(['1m', '30m']);

function cacheFresh(symbol: string, period: ViewPeriod, at: number, now: number): boolean {
  if (marketOf(symbol) !== 'CN') return now - at < CACHE_TTL_MS;
  const activeTtl = INTRADAY_VIEW.has(period) ? CACHE_TTL_MS : CN_DAILY_TTL_MS;
  return cnCacheFresh(at, now, activeTtl, CN_QUIET_TTL_MS);
}

const ADJUSTS: readonly KlineAdjust[] = ['pre', 'none', 'post'];

/** 复权只对 A 股有意义（米筐）；别的市场一律按 pre 处理，避免同一份数据缓存三遍 */
function parseAdjust(symbol: string, raw: string | undefined): KlineAdjust {
  if (raw == null || raw === '') return 'pre';
  if (!(ADJUSTS as readonly string[]).includes(raw)) {
    throw new ClientError(
      `view-timeframe: unsupported adjust ${JSON.stringify(raw)}`,
      `adjust must be one of ${ADJUSTS.join(' | ')}`,
    );
  }
  return marketOf(symbol) === 'CN' ? (raw as KlineAdjust) : 'pre';
}

export interface ViewTimeframeResult {
  period: ViewPeriod;
  adjust: KlineAdjust;
  bars: number;
  tf: IntradayTfData;
}

const cache = new Map<string, { at: number; value: ViewTimeframeResult }>();

function isViewPeriod(period: string): period is ViewPeriod {
  return (VIEW_PERIODS as readonly string[]).includes(period);
}

function clampCount(raw: number | string | undefined): number {
  const count = Math.trunc(Number(raw ?? DEFAULT_COUNT));
  if (!Number.isFinite(count) || count <= 0) return DEFAULT_COUNT;
  return Math.min(MAX_COUNT, Math.max(MACD_MIN_BARS, count));
}

function truncateAt(bars: RawBar[], asOf: string | undefined): RawBar[] {
  if (!asOf) return bars;
  const cutoff = Date.parse(asOf);
  if (!Number.isFinite(cutoff)) return bars;
  return bars.filter((b) => Date.parse(b.time) <= cutoff);
}

export async function buildViewTimeframe(input: {
  symbol: string;
  period: string;
  count?: number | string;
  as_of?: string;
  adjust?: string;
}): Promise<ViewTimeframeResult> {
  const symbol = input.symbol;
  if (!symbol) throw new ClientError('view-timeframe: `symbol` is required');
  if (!isViewPeriod(input.period)) {
    throw new ClientError(
      `view-timeframe: unsupported period ${JSON.stringify(input.period)}`,
      `period must be one of ${VIEW_PERIODS.join(' | ')}; the 5m/15m/1h analysis timeframes come from the chart doc itself`,
    );
  }
  const period = input.period;
  const count = clampCount(input.count);
  const asOf = input.as_of;
  const adjust = parseAdjust(symbol, input.adjust);

  const key = `${symbol}|${period}|${count}|${asOf ?? ''}|${adjust}`;
  const hit = cache.get(key);
  if (hit && cacheFresh(symbol, period, hit.at, Date.now())) return hit.value;

  const bars = truncateAt(
    await getProvider(marketOf(symbol)).getKline(symbol, period, count, 'all', adjust),
    asOf,
  );
  if (bars.length < MACD_MIN_BARS) {
    throw new ClientError(
      asOf
        ? `view-timeframe: only ${bars.length} ${period} bars exist at or before ${asOf}`
        : `view-timeframe: only ${bars.length} ${period} bars available for ${symbol}`,
      asOf
        ? '该周期取不到分析时刻的数据——分钟级历史深度有限，换更大的周期或看最新的图'
        : `need at least ${MACD_MIN_BARS} bars for MACD warm-up`,
    );
  }

  const coerced = coerceIntradayTimeframe(bars, period, undefined, marketOf(symbol));
  const value: ViewTimeframeResult = {
    period,
    adjust,
    bars: bars.length,
    tf: buildTimeframeView(coerced, period, symbol),
  };

  if (cache.size >= CACHE_MAX_ENTRIES) cache.clear();
  cache.set(key, { at: Date.now(), value });
  return value;
}
