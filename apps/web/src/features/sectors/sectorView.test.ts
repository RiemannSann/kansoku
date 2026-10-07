import { describe, expect, it } from 'vitest';
import type { SectorBoard, SectorStat } from '@kansoku/shared/types';
import { breadthText, formatPct, pctTone, statTitle, watchSectors } from './sectorView';

function stat(
  code: string,
  name: string,
  level: 1 | 2,
  extra: Partial<SectorStat> = {},
): SectorStat {
  return {
    code,
    name,
    level,
    pct: 1.234,
    pctFromIndex: true,
    members: 42,
    up: 25,
    down: 12,
    flat: 5,
    limitUp: 3,
    limitDown: 0,
    turnover: 1e10,
    leader: null,
    ...extra,
  };
}

const BOARD: SectorBoard = {
  asOf: '2026-10-08 10:00:03',
  l1: [stat('801780.INDX', '银行', 1), stat('801120.INDX', '食品饮料', 1, { pct: -0.5 })],
  l2: [stat('801783.INDX', '股份制银行Ⅱ', 2, { pct: 0.8, limitUp: 1, parent: '801780.INDX' })],
  memberOf: {
    '000001.SZ': { l1: '801780.INDX', l2: '801783.INDX' },
    '600519.SH': { l1: '801120.INDX', l2: '801125.INDX' },
  },
};

describe('sectorView', () => {
  it('formats change and tone', () => {
    expect(formatPct(1.234)).toBe('+1.23%');
    expect(formatPct(-0.5)).toBe('-0.50%');
    expect(formatPct(null)).toBe('—');
    expect(pctTone(0.001)).toBe('flat');
    expect(pctTone(-1)).toBe('down');
  });

  it('describes breadth and the change source', () => {
    expect(breadthText(stat('x', '银行', 1))).toBe('涨停 3 · 涨 25 跌 12 平 5');
    expect(breadthText(stat('x', '银行', 1, { limitUp: 0, flat: 0 }))).toBe('涨 25 跌 12');
    expect(statTitle(stat('x', '银行', 1, { pctFromIndex: false }))).toContain('成员股平均');
  });

  it('maps each watched stock to its level-2 industry, falling back to level 1', () => {
    const map = watchSectors(BOARD);
    expect(map['000001.SZ']).toMatchObject({ name: '股份制银行Ⅱ', pct: 0.8, limitUp: 1 });
    expect(map['000001.SZ']!.title.split('\n')).toHaveLength(2);
    expect(map['600519.SH']).toMatchObject({ name: '食品饮料', pct: -0.5 });
    expect(watchSectors(null)).toEqual({});
  });
});
