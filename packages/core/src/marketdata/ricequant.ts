import type { KlineAdjust, NewsItem, RawBar } from '@kansoku/shared/types';
import { ClientError } from '../platform/errors.js';
import type { FlowRow } from '../analysis/simple.js';
import { readCnWatchlist } from './cnWatchlist.js';
import { getRicequantBridge, RicequantBridgeError, type RicequantCall } from './ricequantBridge.js';
import { getRicequantGuard, type RicequantGuard } from './ricequantGuard.js';
import { parseShanghai, rqBarTime } from './ricequantTime.js';
import type { MarketDataProvider, RawQuote, SecurityProfile } from './types.js';

// 米筐（rqdatac）数据源，只服务沪深 A 股（.SH / .SZ）。
// 美股/港股仍走长桥：在 .env 里设 MARKET_PROVIDER_CN=ricequant 即可只把 A 股切过来。

interface BridgeBar {
  t: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number;
  turnover: number;
}

export interface BridgeSnapshot {
  symbol: string;
  datetime: string;
  last: number | null;
  prev_close: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number;
  turnover: number;
  /** 指数没有涨跌停，米筐给 0 */
  limit_up?: number | null;
  limit_down?: number | null;
  /** 买一到买五 / 卖一到卖五；集合竞价时买一 = 卖一 = 竞价撮合价 */
  bids?: Array<number | null>;
  bid_vols?: Array<number | null>;
  asks?: Array<number | null>;
  ask_vols?: Array<number | null>;
}

interface BridgeNews {
  id: string;
  title: string;
  t: string;
  url: string;
}

const SUPPORTED_PERIODS = new Set(['1m', '5m', '15m', '30m', '1h', 'day', 'week', 'month']);
const PERIOD_ALIASES: Record<string, string> = { '60m': '1h' };

function normalizePeriod(period: string): string {
  const normalized = PERIOD_ALIASES[period] ?? period;
  if (!SUPPORTED_PERIODS.has(normalized)) {
    throw new ClientError(
      `getKline: unsupported period "${period}"`,
      `ricequant supported periods: ${[...SUPPORTED_PERIODS].join(', ')}`,
    );
  }
  return normalized;
}

function pctText(last: number, prev: number): string {
  if (!prev || !Number.isFinite(last) || !Number.isFinite(prev)) return '0';
  return ((last / prev - 1) * 100).toFixed(3);
}

function isoShanghai(label: string): string {
  return new Date(parseShanghai(label)).toISOString();
}

export function toRawBars(rows: BridgeBar[], period: string): RawBar[] {
  const out: RawBar[] = [];
  for (const row of rows) {
    if (row.open == null || row.high == null || row.low == null || row.close == null) continue;
    out.push({
      time: rqBarTime(row.t, period),
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
      ...(row.turnover > 0 ? { turnover: row.turnover } : {}),
    });
  }
  return out;
}

export function toRawQuote(snap: BridgeSnapshot): RawQuote | null {
  if (snap.last == null || snap.prev_close == null) return null;
  return {
    symbol: snap.symbol,
    last: String(snap.last),
    prev_close: String(snap.prev_close),
    change_percentage: pctText(snap.last, snap.prev_close),
    ...(snap.turnover > 0 ? { turnover: String(snap.turnover) } : {}),
  };
}

export function createRicequantProvider(
  call: RicequantCall = (method, params) => getRicequantBridge().call(method, params),
  guard: Pick<RicequantGuard, 'blockReason' | 'klineCount'> | null = null,
): MarketDataProvider {
  const nameCache = new Map<string, Promise<string | null>>();

  async function request<T>(label: string, method: string, params: Record<string, unknown>) {
    const blocked = guard?.blockReason(method);
    if (blocked) throw new ClientError(`ricequant ${label} skipped: ${blocked}`, blocked, 503);
    try {
      return await call<T>(method, params);
    } catch (error) {
      if (error instanceof ClientError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      const unavailable =
        error instanceof RicequantBridgeError && error.code === 'BRIDGE_UNAVAILABLE';
      throw new ClientError(
        `ricequant ${label} failed: ${message}`,
        unavailable
          ? '请确认 .env 里 RQ_PYTHON 指向装了 rqdatac 的 Python，RQ_LICENSE_FILE 指向米筐 license 文件。'
          : '米筐接口返回错误；如果是流量或 license 问题，检查 rqdatac 账户额度。',
        unavailable ? 503 : 502,
      );
    }
  }

  async function announcements(symbol: string, limit: number): Promise<NewsItem[]> {
    const rows = await request<BridgeNews[]>('news', 'news', { symbol, limit });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      published_at: isoShanghai(row.t),
      url: row.url,
    }));
  }

  return {
    name: 'ricequant',
    capabilities: new Set(['flow', 'market-cap', 'watchlist']),

    async getKline(
      symbol: string,
      period: string,
      count: number,
      _session?: string,
      adjust?: KlineAdjust,
    ): Promise<RawBar[]> {
      const normalized = normalizePeriod(period);
      const rows = await request<BridgeBar[]>('kline', 'kline', {
        symbol,
        period: normalized,
        count: guard ? guard.klineCount(count) : count,
        ...(adjust && adjust !== 'pre' ? { adjust } : {}),
      });
      return toRawBars(rows, normalized);
    },

    async getQuotes(symbols: string[]): Promise<RawQuote[]> {
      if (!symbols.length) return [];
      const rows = await request<BridgeSnapshot[]>('quote', 'snapshot', { symbols });
      return rows.flatMap((row) => {
        const quote = toRawQuote(row);
        return quote ? [quote] : [];
      });
    },

    getSecurityName(symbol: string): Promise<string | null> {
      const key = symbol.toUpperCase();
      const cached = nameCache.get(key);
      if (cached) return cached;
      const pending = request<Array<{ symbol: string; name: string }>>('names', 'names', {
        symbols: [key],
      })
        .then((rows) => rows[0]?.name?.trim() || null)
        .catch(() => null);
      nameCache.set(key, pending);
      void pending.then((name) => {
        if (!name && nameCache.get(key) === pending) nameCache.delete(key);
      });
      return pending;
    },

    getNewsStrict(symbol: string, limit = 6): Promise<NewsItem[]> {
      return announcements(symbol, limit);
    },

    async getNews(symbol: string, limit = 6): Promise<NewsItem[]> {
      try {
        return await announcements(symbol, limit);
      } catch {
        return [];
      }
    },

    async getFlow(symbol: string): Promise<FlowRow[]> {
      const rows = await request<Array<{ t: string; inflow: number }>>('capital flow', 'flow', {
        symbol,
      });
      return rows.map((row) => ({ time: isoShanghai(row.t), inflow: row.inflow }));
    },

    async getNetInflows(symbols: string[]): Promise<Record<string, number>> {
      if (!symbols.length) return {};
      return request<Record<string, number>>('capital flow', 'flow_totals', { symbols });
    },

    async getSecurityProfiles(symbols: string[]): Promise<Record<string, SecurityProfile>> {
      if (!symbols.length) return {};
      return request<Record<string, SecurityProfile>>('profiles', 'profiles', { symbols });
    },

    // 自选股来自本机文件（见 cnWatchlist.ts），不走米筐
    getWatchlistSymbols(): Promise<string[]> {
      return readCnWatchlist();
    },

    async getMarketCaps(symbols: string[]): Promise<Record<string, number>> {
      if (!symbols.length) return {};
      return request<Record<string, number>>('market caps', 'market_caps', { symbols });
    },
  };
}

export const ricequantProvider: MarketDataProvider = createRicequantProvider(
  undefined,
  getRicequantGuard(),
);
