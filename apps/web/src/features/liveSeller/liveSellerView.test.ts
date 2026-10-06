import { describe, expect, it } from 'vitest';
import type { LiveSellerOut } from '@kansoku/core/contract/index';
import { cellTone, headerLabel, isNumericHeader, rowsForSymbol } from './liveSellerView';

describe('live seller view rules', () => {
  it('colors only the return columns by sign', () => {
    expect(cellTone('Ret', '+0.67%')).toBe('up');
    expect(cellTone('Now%', '-1.20%')).toBe('down');
    expect(cellTone('EstNow%', '-')).toBeNull();
    expect(cellTone('Ret', '0.00%')).toBeNull();
    expect(cellTone('Notional', '-5')).toBeNull();
  });

  it('right-aligns numeric columns, including per-box remaining', () => {
    expect(isNumericHeader('OS Rem/Init')).toBe(true);
    expect(isNumericHeader('Avg Px')).toBe(true);
    expect(isNumericHeader('Name')).toBe(false);
  });

  it('translates known headers and keeps unknown ones', () => {
    expect(headerLabel('Notional')).toBe('金额');
    expect(headerLabel('OS3 Rem/Init')).toBe('OS3 Rem/Init');
  });
});

describe('per-symbol live rows', () => {
  const empty = { headers: [], rows: [], count: 0 };
  const out: LiveSellerOut = {
    connected: true,
    url: '',
    updatedAt: '',
    dataAgeSeconds: null,
    degraded: { level: '', reason: '' },
    lastError: '',
    warnings: [],
    summary: { headers: [], rows: [], caption: '' },
    sections: {
      buy: empty,
      intent: {
        headers: ['Code', 'Name', 'Side'],
        rows: [
          { cells: ['000001', '平安银行', 'LU'], style: '', cellStyles: [], symbol: '000001.SZ' },
        ],
        count: 1,
      },
      sold: empty,
      available: {
        headers: ['Key', 'Code', 'Name', 'OS Rem/Init', 'OS3 Rem/Init', 'EstNow%'],
        rows: [
          {
            cells: ['b', '300750', '宁德时代', '1,000/1,000', '-', '-0.85%'],
            style: '',
            cellStyles: [],
            symbol: '300750.SZ',
          },
        ],
        count: 1,
      },
    },
  };

  it('picks one stock’s rows without the identity or empty columns', () => {
    expect(rowsForSymbol(out, '300750.SZ')).toEqual([
      {
        section: 'available',
        fields: [
          ['OS Rem/Init', '1,000/1,000'],
          ['EstNow%', '-0.85%'],
        ],
      },
    ]);
    expect(rowsForSymbol({ connected: false, url: '', error: 'x' }, '300750.SZ')).toEqual([]);
  });
});
