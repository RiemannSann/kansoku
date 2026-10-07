import type { CnLiveHolding, CnLiveHoldingPart } from '@kansoku/shared/types';
import type { LiveSellerOut, LiveSellerSection } from '../contract/positions.js';
import type { RawPosition } from '../marketdata/types.js';
import { fetchLiveSeller } from './liveSeller.js';

// 个股页持仓（A 股）：从 StockSeller 看板快照里找这只票，拆成「今日买入 / 可卖 / 清仓中」几段。
// 看板的单元格都是格式化好的文字（1,234,567 / 1500.00 / +0.67% / 1,200/3,000），这里按表头名取值再解析回数字。

const SECTION_LABELS: Record<CnLiveHoldingPart['section'], string> = {
  buy: '今日买入',
  available: '可卖',
  sold: '清仓中',
};

/** "1,234,567" / "1500.00" → 数字；"-" 或空 → null */
export function parseNumberCell(cell: string | undefined): number | null {
  if (cell == null) return null;
  const text = cell.replace(/,/g, '').trim();
  if (!text || text === '-') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** "+0.67%" → 0.67 */
export function parsePercentCell(cell: string | undefined): number | null {
  if (cell == null) return null;
  return parseNumberCell(cell.replace('%', ''));
}

/** 每台服务器一列：买入表 "OS Buy Qty" = "1,200"，可卖 / 清仓表 "OS Rem/Init" = "1,200/3,000"（取剩余） */
function sharesOf(section: LiveSellerSection, cells: string[]): number | null {
  let total: number | null = null;
  section.headers.forEach((header, i) => {
    let qty: number | null = null;
    if (header.endsWith(' Buy Qty')) qty = parseNumberCell(cells[i]);
    else if (header.endsWith(' Rem/Init')) qty = parseNumberCell(cells[i]?.split('/')[0]);
    if (qty != null) total = (total ?? 0) + qty;
  });
  return total;
}

function cellAt(section: LiveSellerSection, cells: string[], header: string): string | undefined {
  const i = section.headers.indexOf(header);
  return i >= 0 ? cells[i] : undefined;
}

export function cnHoldingFrom(snapshot: LiveSellerOut, symbol: string): CnLiveHolding {
  if (!snapshot.connected) return { connected: false, updatedAt: null, parts: [] };
  const parts: CnLiveHoldingPart[] = [];
  for (const key of ['buy', 'available', 'sold'] as const) {
    const section = snapshot.sections[key];
    for (const row of section.rows) {
      if (row.symbol !== symbol) continue;
      parts.push({
        section: key,
        label: SECTION_LABELS[key],
        shares: sharesOf(section, row.cells),
        avgPx: parseNumberCell(cellAt(section, row.cells, 'Avg Px')),
        notional: parseNumberCell(cellAt(section, row.cells, 'Notional')),
        retPct: parsePercentCell(
          cellAt(section, row.cells, key === 'available' ? 'EstNow%' : 'Ret'),
        ),
      });
    }
  }
  return { connected: true, updatedAt: snapshot.updatedAt || null, parts };
}

/**
 * 能算浮盈的部分（有股数也有均价：今日买入、清仓中）合成一笔持仓，交给原来的持仓计算（浮盈、离止损）；
 * 「可卖」表看板不给均价，只在实盘明细里列出来。
 */
export function cnRawPosition(holding: CnLiveHolding, symbol: string): RawPosition | null {
  let shares = 0;
  let costValue = 0;
  for (const part of holding.parts) {
    if (part.section === 'available' || !part.shares || part.avgPx == null) continue;
    shares += part.shares;
    costValue += part.shares * part.avgPx;
  }
  if (shares <= 0) return null;
  return {
    symbol,
    name: '',
    market: 'CN',
    currency: 'CNY',
    quantity: String(shares),
    available: '0',
    cost_price: String(costValue / shares),
  };
}

// 同一时刻打开几只 A 股的个股页时共用一次快照
const CACHE_MS = 5_000;
let cache: { at: number; value: Promise<LiveSellerOut> } | null = null;

export function readLiveSellerCached(now = Date.now()): Promise<LiveSellerOut> {
  if (cache && now - cache.at < CACHE_MS) return cache.value;
  const value = fetchLiveSeller();
  cache = { at: now, value };
  return value;
}

export function resetLiveSellerCacheForTests(): void {
  cache = null;
}
