import type { CnLiveHolding } from '@kansoku/shared/types';
import { formatAmount } from './depthView';

export interface CnLiveRow {
  label: string;
  shares: string;
  avgPx: string;
  notional: string;
  ret: string;
  tone: 'up' | 'down' | 'flat';
}

export interface CnLiveView {
  /** 看板没开 / 没有这只票时给一句说明，有仓位时为 null */
  note: string | null;
  rows: CnLiveRow[];
  updatedAt: string | null;
}

/** 「环境」tab 的 A 股实盘明细：每一段（今日买入 / 可卖 / 清仓中）一行 */
export function buildCnLiveView(holding: CnLiveHolding): CnLiveView {
  if (!holding.connected) {
    return {
      note: '实盘看板没开：在本机启动 StockSeller 的 live_view_web.py（默认 127.0.0.1:8766）后这里显示 A 股实盘仓位',
      rows: [],
      updatedAt: null,
    };
  }
  if (!holding.parts.length) {
    return { note: '实盘里没有这只票', rows: [], updatedAt: holding.updatedAt };
  }
  return {
    note: null,
    updatedAt: holding.updatedAt,
    rows: holding.parts.map((part) => ({
      label: part.label,
      shares: part.shares == null ? '—' : `${part.shares.toLocaleString('en-US')} 股`,
      // 股票两位小数；ETF / 可转债是三位（看板按代码给的位数，这里看有没有第三位）
      avgPx:
        part.avgPx == null
          ? '—'
          : part.avgPx.toFixed(Math.round(part.avgPx * 1000) % 10 !== 0 ? 3 : 2),
      notional: part.notional == null ? '—' : formatAmount(part.notional),
      ret: part.retPct == null ? '—' : `${part.retPct > 0 ? '+' : ''}${part.retPct.toFixed(2)}%`,
      tone: part.retPct == null || part.retPct === 0 ? 'flat' : part.retPct > 0 ? 'up' : 'down',
    })),
  };
}
