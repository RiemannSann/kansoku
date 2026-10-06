import type { QuoteCell } from '@kansoku/shared/types';
import { limitState } from '@web/lib/limitState';
import { marketOfSymbol } from '@web/lib/market';

export interface WatchRow {
  symbol: string;
  /** 不带 .SH / .SZ 的六位代码，和同花顺一样 */
  code: string;
  name: string;
  last: number;
  pct: number | null;
  /** 涨跌额 */
  change: number | null;
  /** 股 */
  volume: number | null;
  /** 元 */
  turnover: number | null;
  session: string;
  atLimit: 'up' | 'down' | null;
  /** 在自选文件里的顺序（行情推送的顺序），「默认排序」就按它 */
  order: number;
}

export type SortKey = 'order' | 'code' | 'pct' | 'change' | 'last' | 'volume' | 'turnover';
export type SortDir = 'asc' | 'desc';

export function buildWatchRows(
  quotes: QuoteCell[],
  profiles: Record<string, { name?: string }>,
  exclude: ReadonlySet<string>,
): WatchRow[] {
  const rows: WatchRow[] = [];
  const seen = new Set<string>();
  for (const quote of quotes) {
    if (seen.has(quote.symbol) || exclude.has(quote.symbol)) continue;
    if (marketOfSymbol(quote.symbol) !== 'CN') continue;
    seen.add(quote.symbol);
    const prev = quote.pct != null && quote.pct > -100 ? quote.last / (1 + quote.pct / 100) : null;
    rows.push({
      symbol: quote.symbol,
      code: quote.symbol.replace(/\.(sh|sz)$/i, ''),
      name: profiles[quote.symbol]?.name ?? '',
      last: quote.last,
      pct: quote.pct,
      change: prev == null ? null : quote.last - prev,
      volume: quote.volume ?? null,
      turnover: quote.turnover ?? null,
      session: quote.session,
      atLimit: limitState(quote),
      order: rows.length,
    });
  }
  return rows;
}

/** 排序：空值永远排在最后；同值按自选顺序 */
export function sortWatchRows(rows: WatchRow[], key: SortKey, dir: SortDir): WatchRow[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === 'order') return (a.order - b.order) * sign;
    if (key === 'code') return a.code.localeCompare(b.code) * sign || a.order - b.order;
    const av = a[key];
    const bv = b[key];
    if (av == null && bv == null) return a.order - b.order;
    if (av == null) return 1;
    if (bv == null) return -1;
    return (av - bv) * sign || a.order - b.order;
  });
}

/** 点表头：没排这列 → 降序；降序 → 升序；升序 → 回到自选顺序（同花顺的三态） */
export function nextSort(
  current: { key: SortKey; dir: SortDir },
  clicked: SortKey,
): { key: SortKey; dir: SortDir } {
  if (current.key !== clicked) return { key: clicked, dir: clicked === 'code' ? 'asc' : 'desc' };
  const first: SortDir = clicked === 'code' ? 'asc' : 'desc';
  if (current.dir === first) return { key: clicked, dir: first === 'asc' ? 'desc' : 'asc' };
  return { key: 'order', dir: 'asc' };
}
