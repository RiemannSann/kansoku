import type { PortfolioSummary } from '@kansoku/shared/types';
import { defineRoutes } from './defineRoutes.js';

export interface LiveSellerRow {
  cells: string[];
  /** 看板给的整行标记：negative / intent / both / gfd */
  style: string;
  /** 看板给的单元格标记：traded / partial / cancelled / waiting / dim */
  cellStyles: string[];
  /** Code 列换算成的 600519.SH；认不出来是 null */
  symbol: string | null;
}

export interface LiveSellerSection {
  headers: string[];
  rows: LiveSellerRow[];
  count: number;
}

export interface LiveSellerSections {
  buy: LiveSellerSection;
  intent: LiveSellerSection;
  sold: LiveSellerSection;
  available: LiveSellerSection;
}

/** StockSeller 实盘看板（live_view_web.py）的只读快照 */
export type LiveSellerOut =
  | {
      connected: true;
      url: string;
      updatedAt: string;
      dataAgeSeconds: number | null;
      degraded: { level: string; reason: string };
      lastError: string;
      warnings: Array<{ source: string; error: string; at: string }>;
      summary: { headers: string[]; rows: string[][]; caption: string };
      sections: LiveSellerSections;
    }
  | { connected: false; url: string; error: string };

export interface PositionsApi {
  list(): Promise<PortfolioSummary>;
  liveSeller(): Promise<LiveSellerOut>;
}

export const positionsRoutes = defineRoutes<PositionsApi>('positions', {
  list: { method: 'GET', path: '/' },
  liveSeller: { method: 'GET', path: '/live-seller' },
});
