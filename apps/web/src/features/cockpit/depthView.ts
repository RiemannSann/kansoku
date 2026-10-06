import type { QuoteDepth } from '@kansoku/shared/types';

export type Tone = 'up' | 'down' | 'flat';

export interface DepthRow {
  label: string;
  price: string;
  /** 手（1 手 = 100 股），和同花顺一致 */
  lots: string;
  tone: Tone;
  /** 这一档挂单量占十档最大挂单的比例，画背景条用 */
  share: number;
}

export interface DepthView {
  last: string;
  pct: string | null;
  tone: Tone;
  auction: boolean;
  /** 现价已经顶到涨停 / 跌停 */
  atLimit: 'up' | 'down' | null;
  limitUp: string | null;
  limitDown: string | null;
  /** 卖五在上、卖一在下，紧挨着买一 */
  asks: DepthRow[];
  bids: DepthRow[];
  stats: Array<{ label: string; value: string; tone: Tone }>;
}

const CN_NUMERALS = ['一', '二', '三', '四', '五'];

/** A 股价格两位小数，ETF / 可转债三位 */
function priceDigits(depth: QuoteDepth): number {
  const prices = [depth.last, ...depth.bids.map((l) => l.price), ...depth.asks.map((l) => l.price)];
  return prices.some((p) => Math.abs(p * 100 - Math.round(p * 100)) > 1e-6) ? 3 : 2;
}

function toneOf(price: number | null, prevClose: number | null): Tone {
  if (price == null || prevClose == null) return 'flat';
  if (price > prevClose + 1e-9) return 'up';
  if (price < prevClose - 1e-9) return 'down';
  return 'flat';
}

/** 股 → 手；不满 1 手的零股也显示出来，不四舍五入成 0 */
export function formatLots(shares: number): string {
  const lots = shares / 100;
  if (lots >= 10_000) return `${(lots / 10_000).toFixed(2)}万`;
  return lots >= 1 || lots === 0 ? String(Math.round(lots)) : lots.toFixed(2);
}

/** 成交额：亿 / 万 */
export function formatAmount(yuan: number): string {
  if (yuan >= 1e8) return `${(yuan / 1e8).toFixed(2)}亿`;
  if (yuan >= 1e4) return `${(yuan / 1e4).toFixed(0)}万`;
  return yuan.toFixed(0);
}

export function buildDepthView(depth: QuoteDepth): DepthView {
  const digits = priceDigits(depth);
  const price = (p: number | null) => (p == null ? '—' : p.toFixed(digits));
  const maxVol = Math.max(
    1,
    ...depth.bids.map((l) => l.volume),
    ...depth.asks.map((l) => l.volume),
  );
  const rows = (side: '买' | '卖', levels: QuoteDepth['bids']): DepthRow[] =>
    CN_NUMERALS.map((n, i) => {
      const level = levels[i];
      return {
        label: `${side}${n}`,
        price: level ? price(level.price) : '—',
        lots: level ? formatLots(level.volume) : '',
        tone: level ? toneOf(level.price, depth.prevClose) : 'flat',
        share: level ? level.volume / maxVol : 0,
      };
    });
  const pct =
    depth.prevClose != null && depth.prevClose > 0
      ? (depth.last / depth.prevClose - 1) * 100
      : null;
  const near = (a: number, b: number | null) => b != null && Math.abs(a - b) < 1e-6;
  return {
    last: price(depth.last),
    pct: pct == null ? null : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`,
    tone: toneOf(depth.last, depth.prevClose),
    auction: depth.auction,
    atLimit: near(depth.last, depth.limitUp)
      ? 'up'
      : near(depth.last, depth.limitDown)
        ? 'down'
        : null,
    limitUp: depth.limitUp == null ? null : price(depth.limitUp),
    limitDown: depth.limitDown == null ? null : price(depth.limitDown),
    asks: rows('卖', depth.asks).reverse(),
    bids: rows('买', depth.bids),
    stats: [
      { label: '今开', value: price(depth.open), tone: toneOf(depth.open, depth.prevClose) },
      { label: '昨收', value: price(depth.prevClose), tone: 'flat' },
      { label: '最高', value: price(depth.high), tone: toneOf(depth.high, depth.prevClose) },
      { label: '最低', value: price(depth.low), tone: toneOf(depth.low, depth.prevClose) },
      { label: '成交量', value: `${formatLots(depth.volume)}手`, tone: 'flat' },
      { label: '成交额', value: formatAmount(depth.turnover), tone: 'flat' },
    ],
  };
}
