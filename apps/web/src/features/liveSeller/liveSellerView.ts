import type { LiveSellerOut } from '@kansoku/core/contract/index';

// 实盘看板的纯展示规则（和 live_view_web.py 的表格口径保持一致）

export const SECTION_ORDER = ['buy', 'intent', 'sold', 'available'] as const;
export type SectionKey = (typeof SECTION_ORDER)[number];

export const SECTION_LABEL: Record<SectionKey, string> = {
  buy: '今日买入',
  intent: '买入意向',
  sold: '卖出中 / 已清仓',
  available: '可卖持仓',
};

// 表头沿用看板原文（Code / Notional …），只把常见的翻成中文
const HEADER_LABEL: Record<string, string> = {
  'Key': '键',
  'Code': '代码',
  'Name': '名称',
  'Lane': '通道',
  'Notional': '金额',
  'Avg Px': '均价',
  'Last': '现价',
  'Ret': '收益',
  'Now%': '当日',
  'EstNow%': '估当日',
  'Prev': '昨',
  'Side': '方向',
  'Cur': '状态',
  'Time': '时间',
  'Status': '报单',
  'Decision Review': '复盘',
};

export function headerLabel(header: string): string {
  return HEADER_LABEL[header] ?? header;
}

export function isNumericHeader(header: string): boolean {
  return /qty|notional|avg|last|ret|now|estnow|rem\/init|overall|mtm|win rate/i.test(header);
}

/** 收益类列按正负上色；其它列不上色 */
export function cellTone(header: string, value: string): 'up' | 'down' | null {
  if (!/^(ret|now%|estnow%|overall)$/i.test(header.trim())) return null;
  const number = Number.parseFloat(value.replaceAll(/[\s%,]/g, ''));
  if (!Number.isFinite(number) || number === 0) return null;
  return number > 0 ? 'up' : 'down';
}

export interface SymbolLiveRow {
  section: SectionKey;
  /** 去掉键、代码、名称后的 [表头, 值]；空值（-）不要 */
  fields: Array<[string, string]>;
}

const IDENTITY_HEADERS = new Set(['key', 'code', 'name']);

/** 某只票在实盘看板各个表里的那几行（个股页侧栏用） */
export function rowsForSymbol(out: LiveSellerOut | null, symbol: string): SymbolLiveRow[] {
  if (!out?.connected) return [];
  return SECTION_ORDER.flatMap((section) =>
    out.sections[section].rows
      .filter((row) => row.symbol === symbol)
      .map((row) => ({
        section,
        fields: row.cells.flatMap((cell, i): Array<[string, string]> => {
          const header = out.sections[section].headers[i] ?? '';
          if (IDENTITY_HEADERS.has(header.toLowerCase()) || !cell || cell === '-') return [];
          return [[header, cell]];
        }),
      })),
  );
}
