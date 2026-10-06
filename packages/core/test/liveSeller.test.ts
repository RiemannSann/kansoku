import { describe, expect, it, vi } from 'vitest';
import {
  fetchLiveSeller,
  heldSymbols,
  liveSellerUrl,
  parseLiveSellerSnapshot,
  readLiveSellerHeld,
} from '../src/liveSeller/liveSeller.js';

// live_view_web.py 的 /api/snapshot 长这样（字段取自它的 snapshot_payload）
const payload = {
  updated_at: '10:31:05 CST',
  data_age_seconds: 2.1,
  degraded: { level: 'ok', reason: '' },
  last_error: '',
  warnings: [{ source: 'to_sell', error: 'boom', at: '10:30:00' }],
  summary: { headers: ['Source', 'Overall'], rows: [{ cells: ['Today', '+1.2%'] }], caption: '' },
  sections: {
    buy: {
      headers: ['Code', 'Name', 'Lane', 'Notional', 'Avg Px', 'Last', 'Ret', 'Now%'],
      rows: [
        {
          cells: ['600519', '贵州茅台', 'LU', '1.2M', '1500.00', '1510.00', '+0.67%', '+0.67%'],
          style: '',
        },
      ],
      count: 1,
    },
    intent: { headers: ['Code', 'Name', 'Side', 'Cur', 'Time', 'Status'], rows: [], count: 0 },
    sold: {
      headers: ['Key', 'Code', 'Name', 'Notional', 'Ret'],
      rows: [{ cells: ['a', '300750', '宁德时代', '800K', '-1.20%'], style: 'negative' }],
      count: 1,
    },
    available: {
      headers: ['Key', 'Code', 'Name', 'Notional', 'EstNow%'],
      rows: [
        {
          cells: ['b', '000001', '平安银行', '500K', '+0.10%'],
          style: '',
          cell_styles: ['', '', '', '', 'dim'],
        },
      ],
      count: 1,
    },
  },
  command_log: ['should not leak'],
};

describe('live seller snapshot', () => {
  it('keeps the dashboard tables and maps codes to chart symbols', () => {
    const out = parseLiveSellerSnapshot('http://x', payload);
    expect(out.connected).toBe(true);
    if (!out.connected) return;
    expect(out.sections.buy.rows[0].symbol).toBe('600519.SH');
    expect(out.sections.sold.rows[0]).toMatchObject({ symbol: '300750.SZ', style: 'negative' });
    expect(out.sections.available.rows[0].cellStyles).toEqual(['', '', '', '', 'dim']);
    expect(out.summary.rows).toEqual([['Today', '+1.2%']]);
    expect(out.warnings).toHaveLength(1);
    expect(JSON.stringify(out)).not.toContain('should not leak');
    expect(heldSymbols(out)).toEqual(['600519.SH', '000001.SZ', '300750.SZ']);
  });

  it('reports a closed dashboard instead of throwing', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('connect ECONNREFUSED');
    }) as unknown as typeof fetch;
    const out = await fetchLiveSeller(fetchImpl, 'http://127.0.0.1:1');
    expect(out).toEqual({
      connected: false,
      url: 'http://127.0.0.1:1',
      error: 'connect ECONNREFUSED',
    });
    expect(heldSymbols(out)).toEqual([]);
  });

  it('only reads the snapshot endpoint', async () => {
    const fetchImpl = vi.fn(async () => Response.json(payload)) as unknown as typeof fetch;
    await fetchLiveSeller(fetchImpl, 'http://127.0.0.1:8766');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetchImpl).mock.calls[0][0]).toBe('http://127.0.0.1:8766/api/snapshot');
    expect(vi.mocked(fetchImpl).mock.calls[0][1]?.method).toBeUndefined();
  });

  it('merges into the home page only when configured', async () => {
    expect(await readLiveSellerHeld({})).toEqual([]);
    expect(liveSellerUrl({ STOCKSELLER_LIVE_URL: 'http://h:1/' })).toBe('http://h:1');
  });
});
