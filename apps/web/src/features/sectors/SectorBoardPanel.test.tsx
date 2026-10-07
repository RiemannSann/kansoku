// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SectorBoard, SectorDetail, SectorStat } from '@kansoku/shared/types';

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
    pct: 0,
    pctFromIndex: true,
    members: 2,
    up: 1,
    down: 1,
    flat: 0,
    limitUp: 0,
    limitDown: 0,
    turnover: 2e9,
    leader: null,
    ...extra,
  };
}

const BANK = stat('801780.INDX', '银行', 1, {
  pct: 1.27,
  limitUp: 1,
  members: 42,
  up: 42,
  down: 0,
});
const FOOD = stat('801120.INDX', '食品饮料', 1, { pct: -0.5 });
const BOARD: SectorBoard = {
  asOf: '2026-10-08 10:00:03',
  l1: [BANK, FOOD],
  l2: [stat('801783.INDX', '股份制银行Ⅱ', 2, { pct: 1.68, parent: '801780.INDX' })],
  memberOf: {},
};
const DETAIL: SectorDetail = {
  asOf: BOARD.asOf,
  stat: BANK,
  members: [
    {
      symbol: '600000.SH',
      name: '浦发银行',
      last: 9.48,
      pct: 3.27,
      turnover: 1.2e9,
      limit: null,
    },
    { symbol: '601988.SH', name: '中国银行', last: null, pct: null, turnover: 0, limit: null },
  ],
};

const subs: string[] = [];
vi.mock('@web/lib/ws/useWsChannel', async () => {
  const { useEffect } = await import('react');
  return {
    useWsChannel: (
      spec: { kind: string; symbol?: string } | null,
      onData: (data: unknown) => void,
    ) => {
      const key = spec ? `${spec.kind}:${spec.symbol ?? ''}` : null;
      useEffect(() => {
        if (!key) return;
        subs.push(key);
        if (key === 'cn-sectors:') onData(BOARD);
        if (key === 'cn-sector:801780.INDX') onData(DETAIL);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [key]);
      return { degraded: false, connected: true, snapshotAt: null };
    },
  };
});

const { SectorBoardPanel } = await import('./SectorBoardPanel');

afterEach(() => {
  cleanup();
  subs.length = 0;
});

describe('SectorBoardPanel', () => {
  it('ranks level-1 industries by change, strongest first', () => {
    render(<SectorBoardPanel />);
    const names = screen.getAllByRole('row').map((r) => r.textContent ?? '');
    expect(names[1]).toContain('银行');
    expect(names[1]).toContain('+1.27%');
    expect(names[2]).toContain('食品饮料');
  });

  it('re-sorts ascending on a second click of the change header', () => {
    render(<SectorBoardPanel />);
    fireEvent.click(screen.getByTitle('按涨跌幅排序'));
    const rows = screen.getAllByRole('row').map((r) => r.textContent ?? '');
    expect(rows[1]).toContain('食品饮料');
  });

  it('expands a row into its level-2 industries and member stocks', () => {
    render(<SectorBoardPanel />);
    fireEvent.click(screen.getAllByRole('row')[1]!);
    expect(subs).toContain('cn-sector:801780.INDX');
    expect(screen.getByText('股份制银行Ⅱ')).toBeTruthy();
    expect(screen.getByText('浦发银行')).toBeTruthy();
    expect(screen.getByText('停牌')).toBeTruthy();
    const link = screen.getByText('600000').closest('a');
    expect(link?.getAttribute('href')).toBe('/symbol/600000.SH');
  });
});
