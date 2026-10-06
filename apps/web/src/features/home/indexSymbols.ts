import type { Market } from '../settings/types';

// 顶栏的指数按「关注市场」设置显示；A 股用上证、深成、创业板、沪深 300
const INDEX_SYMBOLS_BY_MARKET: Record<Market, string[]> = {
  US: ['SPY.US', 'QQQ.US', '.DJI.US', '.VIX.US'],
  HK: [],
  CN: ['000001.SH', '399001.SZ', '399006.SZ', '000300.SH'],
};

/** 所有可能出现在顶栏的指数（其它面板用它把指数从个股列表里排除） */
export const INDEX_SYMBOLS = Object.values(INDEX_SYMBOLS_BY_MARKET).flat();

export const INDEX_LABELS: Record<string, string> = {
  '000001.SH': '上证指数',
  '399001.SZ': '深证成指',
  '399006.SZ': '创业板指',
  '000300.SH': '沪深300',
};

export function indexSymbolsFor(markets: readonly Market[] | null | undefined): string[] {
  const list = (markets?.length ? markets : (['US'] as const)).flatMap(
    (market) => INDEX_SYMBOLS_BY_MARKET[market] ?? [],
  );
  return list.length ? list : INDEX_SYMBOLS_BY_MARKET.US;
}
