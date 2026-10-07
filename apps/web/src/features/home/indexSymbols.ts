import { marketOfSymbol } from '@web/lib/market';
import type { Market } from '../settings/types';

// 顶栏的指数按「关注市场」设置显示；A 股和同花顺首页指数条一样：上证、深成、创业板、科创 50、
// 沪深 300、中证 500、中证 1000
const INDEX_SYMBOLS_BY_MARKET: Record<Market, string[]> = {
  US: ['SPY.US', 'QQQ.US', '.DJI.US', '.VIX.US'],
  HK: [],
  CN: ['000001.SH', '399001.SZ', '399006.SZ', '000688.SH', '000300.SH', '000905.SH', '000852.SH'],
};

/** 所有可能出现在顶栏的指数（其它面板用它把指数从个股列表里排除） */
export const INDEX_SYMBOLS = Object.values(INDEX_SYMBOLS_BY_MARKET).flat();

export const INDEX_LABELS: Record<string, string> = {
  '000001.SH': '上证指数',
  '399001.SZ': '深证成指',
  '399006.SZ': '创业板指',
  '000688.SH': '科创50',
  '000300.SH': '沪深300',
  '000905.SH': '中证500',
  '000852.SH': '中证1000',
};

export function indexSymbolsFor(markets: readonly Market[] | null | undefined): string[] {
  const list = (markets?.length ? markets : (['US'] as const)).flatMap(
    (market) => INDEX_SYMBOLS_BY_MARKET[market] ?? [],
  );
  return list.length ? list : INDEX_SYMBOLS_BY_MARKET.US;
}

/** 指数条上用的短名（同花顺首页指数条的叫法），七个指数带点位要挤在一行里 */
export const INDEX_SHORT_LABELS: Record<string, string> = {
  '000001.SH': '上证',
  '399001.SZ': '深成',
  '399006.SZ': '创业板',
  '000688.SH': '科创50',
  '000300.SH': '沪深300',
  '000905.SH': '中证500',
  '000852.SH': '中证1000',
};

/**
 * 指数条上每个指数除了涨跌幅还显示什么：A 股和同花顺一样带点位；时段标签 A 股只在集合竞价时显示
 * （休市 / 午休整条都一样，左边「盘面」旁边已经标了，七个指数各标一遍太吵）。
 */
export function indexCellExtras(q: { symbol: string; last: number; session: string }): {
  point: string | null;
  badge: string | null;
} {
  const cn = marketOfSymbol(q.symbol) === 'CN';
  if (!cn) return { point: null, badge: q.session !== '日盘' ? q.session : null };
  return {
    point: Number.isFinite(q.last) && q.last > 0 ? q.last.toFixed(2) : null,
    badge: q.session === '集合竞价' ? q.session : null,
  };
}
