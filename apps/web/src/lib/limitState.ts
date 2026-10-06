import type { QuoteCell } from '@kansoku/shared/types';

/** A 股现价是否顶在涨停 / 跌停价上（只有米筐快照带涨跌停价，指数和美股港股返回 null） */
export function limitState(
  quote: Pick<QuoteCell, 'last' | 'limitUp' | 'limitDown'> | null | undefined,
): 'up' | 'down' | null {
  if (!quote) return null;
  const near = (limit: number | undefined) =>
    limit != null && limit > 0 && Math.abs(quote.last - limit) < 1e-6;
  if (near(quote.limitUp)) return 'up';
  if (near(quote.limitDown)) return 'down';
  return null;
}

export const LIMIT_LABEL = { up: '涨停', down: '跌停' } as const;
