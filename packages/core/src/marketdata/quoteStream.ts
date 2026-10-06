import type { QuoteCell, QuoteDepth, RawBar } from '@kansoku/shared/types';
import type { CandleBar, CandlePeriod } from './candleAggregator.js';

export type { CandleBar, CandlePeriod };

export type QuoteListener = (cell: QuoteCell) => void;
export type CandleListener = (bar: CandleBar) => void;

export interface QuoteStream {
  retain(symbols: string[]): Promise<void>;
  release(symbols: string[]): Promise<void>;
  subscribeCandlesticks(
    symbol: string,
    period: CandlePeriod,
    cb: CandleListener,
    seed?: RawBar,
  ): () => void;
  onUpdate(listener: QuoteListener): () => void;
  getSnapshot(symbol: string): QuoteCell | undefined;
  /** 五档盘口；没有盘口数据的行情源不实现 */
  getDepth?(symbol: string): QuoteDepth | undefined;
}
