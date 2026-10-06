import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createRicequantProvider, type BridgeSnapshot } from '../src/marketdata/ricequant.js';
import { RicequantGuard } from '../src/marketdata/ricequantGuard.js';
import { createSnapshotRecorder } from '../src/marketdata/ricequantRecorder.js';
import { RicequantStream } from '../src/marketdata/ricequantStream.js';
import { cnPollPhase, parseShanghai } from '../src/marketdata/ricequantTime.js';

const GB = 1024 ** 3;
const LIMIT = 15 * GB;

function fakeBridge(state: { used: number; trading?: boolean; today?: string }) {
  return vi.fn(async (method: string) => {
    if (method === 'ping') return { bytes_used: state.used, bytes_limit: LIMIT };
    if (method === 'calendar')
      return { today: state.today ?? '2026-10-08', is_trading_day: state.trading ?? true };
    throw new Error(`unexpected ${method}`);
  }) as unknown as <T>(method: string, params?: Record<string, unknown>) => Promise<T>;
}

describe('cn poll phase', () => {
  const at = (day: string, t: string) => parseShanghai(`${day} ${t}`);
  it('is active only inside trading-day sessions', () => {
    expect(cnPollPhase(at('2026-10-08', '09:20:00'), true)).toBe('active');
    expect(cnPollPhase(at('2026-10-08', '14:59:30'), true)).toBe('active');
    expect(cnPollPhase(at('2026-10-08', '09:05:00'), true)).toBe('break');
    expect(cnPollPhase(at('2026-10-08', '12:00:00'), true)).toBe('break');
    expect(cnPollPhase(at('2026-10-08', '15:05:00'), true)).toBe('closed');
    expect(cnPollPhase(at('2026-10-08', '08:00:00'), true)).toBe('closed');
  });

  it('treats a weekday holiday as closed, and an unknown calendar as a trading day', () => {
    expect(cnPollPhase(at('2026-10-07', '10:00:00'), false)).toBe('closed');
    expect(cnPollPhase(at('2026-10-07', '10:00:00'), null)).toBe('active');
    expect(cnPollPhase(at('2026-10-10', '10:00:00'), null)).toBe('closed');
  });
});

describe('ricequant quota guard', () => {
  it('slows polling as the daily quota fills up', async () => {
    const state = { used: 0.1 * LIMIT };
    let now = parseShanghai('2026-10-08 10:00:00');
    const log = vi.fn();
    const guard = new RicequantGuard({ call: fakeBridge(state), now: () => now, log });
    await guard.refresh();
    expect(guard.quotaTier()).toBe('normal');
    expect(guard.pollIntervalMs()).toBe(3_000);

    const steps: Array<[number, string, number]> = [
      [0.55, 'caution', 6_000],
      [0.8, 'saving', 15_000],
      [0.95, 'stop', 60_000],
    ];
    for (const [ratio, tier, interval] of steps) {
      state.used = ratio * LIMIT;
      now += 5 * 60_000;
      await guard.refresh();
      expect(guard.quotaTier()).toBe(tier);
      expect(guard.pollIntervalMs()).toBe(interval);
    }
    expect(log).toHaveBeenCalledTimes(3);
    expect(log.mock.calls.at(-1)![0]).toContain('stop');
  });

  it('projects today’s burn rate, but a projection alone never stops data', async () => {
    const state = { used: 0.05 * LIMIT };
    let now = parseShanghai('2026-10-08 09:30:00');
    const guard = new RicequantGuard({ call: fakeBridge(state), now: () => now, log: () => {} });
    await guard.refresh();
    // 15 分钟烧掉 10%：照这个速度今天会远超上限
    now += 15 * 60_000;
    state.used = 0.15 * LIMIT;
    await guard.refresh();
    expect(guard.status().projected).toBeGreaterThan(LIMIT);
    expect(guard.quotaTier()).toBe('saving');
  });

  it('starts over after Beijing midnight resets the counter', async () => {
    const state = { used: 0.8 * LIMIT, today: '2026-10-08' };
    let now = parseShanghai('2026-10-08 23:50:00');
    const guard = new RicequantGuard({ call: fakeBridge(state), now: () => now, log: () => {} });
    await guard.refresh();
    expect(guard.quotaTier()).toBe('saving');
    now = parseShanghai('2026-10-09 00:05:00');
    state.used = 0.001 * LIMIT;
    state.today = '2026-10-09';
    await guard.refresh();
    expect(guard.quotaTier()).toBe('normal');
  });

  it('blocks non-essential bridge calls when saving, and caps kline size when stopped', async () => {
    const state = { used: 0.8 * LIMIT };
    const now = parseShanghai('2026-10-08 10:00:00');
    const guard = new RicequantGuard({ call: fakeBridge(state), now: () => now, log: () => {} });
    await guard.refresh();
    expect(guard.blockReason('flow_totals')).toContain('80%');
    expect(guard.blockReason('snapshot')).toBeNull();
    expect(guard.blockReason('kline')).toBeNull();
    expect(guard.klineCount(1000)).toBe(1000);

    const call = vi.fn().mockResolvedValue({});
    const provider = createRicequantProvider(call, guard);
    await expect(provider.getNetInflows!(['600519.SH'])).rejects.toMatchObject({ status: 503 });
    expect(call).not.toHaveBeenCalled();

    state.used = 0.95 * LIMIT;
    await guard.refresh();
    const later = new RicequantGuard({
      call: fakeBridge(state),
      now: () => now + 1,
      log: () => {},
    });
    await later.refresh();
    expect(later.klineCount(1000)).toBe(300);
    expect(later.blockReason('news')).not.toBeNull();
  });

  it('does not poll at the session pace on a weekday holiday', async () => {
    const now = parseShanghai('2026-10-07 10:00:00');
    const guard = new RicequantGuard({
      call: fakeBridge({ used: 0, trading: false, today: '2026-10-07' }),
      now: () => now,
      log: () => {},
    });
    expect(guard.pollIntervalMs()).toBe(3_000); // 日历还没回来：先按交易日
    await guard.refresh();
    expect(guard.isTradingDay()).toBe(false);
    expect(guard.pollIntervalMs()).toBe(5 * 60_000);
  });

  it('keeps the last tier when the bridge cannot be reached', async () => {
    const now = parseShanghai('2026-10-08 10:00:00');
    const call = vi.fn().mockRejectedValue(new Error('bridge down'));
    const guard = new RicequantGuard({ call, now: () => now, log: () => {} });
    await guard.refresh();
    expect(guard.quotaTier()).toBe('normal');
    expect(guard.isTradingDay()).toBeNull();
    expect(guard.pollIntervalMs()).toBe(3_000);
  });
});

function snap(symbol: string, volume: number, datetime = '2026-10-08 10:00:03'): BridgeSnapshot {
  return {
    symbol,
    datetime,
    last: 10,
    prev_close: 9.9,
    open: 10,
    high: 10,
    low: 10,
    volume,
    turnover: volume * 10,
    bids: [9.99],
    asks: [10],
  };
}

describe('ricequant stream snapshot cap', () => {
  it('always polls charted symbols and rotates the rest through the cap', async () => {
    const asked: string[][] = [];
    const stream = new RicequantStream({
      fetchSnapshots: async (symbols) => {
        asked.push(symbols);
        return [];
      },
      fetchSeed: async () => undefined,
      schedule: () => setTimeout(() => {}, 0),
      cancel: () => {},
      policy: { pollIntervalMs: () => 3_000, snapshotCap: () => 3 },
    });
    stream.subscribeCandlesticks('600519.SH', '5m', () => {});
    await stream.retain(['A.SH', 'B.SH', 'C.SH', 'D.SH']);
    asked.length = 0;
    for (let i = 0; i < 4; i++) await stream.poll();
    for (const batch of asked) {
      expect(batch).toHaveLength(3);
      expect(batch[0]).toBe('600519.SH');
    }
    const seen = new Set(asked.flatMap((batch) => batch.slice(1)));
    expect(seen).toEqual(new Set(['A.SH', 'B.SH', 'C.SH', 'D.SH']));
  });
});

describe('ricequant snapshot recorder', () => {
  it('appends only changed rows of the chosen symbols, one file per Beijing day', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'rq-record-'));
    const record = createSnapshotRecorder(['600519.SH'], dir);
    const polledAt = parseShanghai('2026-10-08 10:00:04');
    record([snap('600519.SH', 100), snap('000001.SZ', 5)], polledAt);
    record([snap('600519.SH', 100)], polledAt + 3_000);
    record([snap('600519.SH', 200, '2026-10-08 10:00:06')], polledAt + 6_000);
    await vi.waitFor(async () => {
      const text = await readFile(path.join(dir, 'snapshots-2026-10-08.jsonl'), 'utf8');
      expect(text.trim().split('\n')).toHaveLength(2);
    });
    const rows = (await readFile(path.join(dir, 'snapshots-2026-10-08.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(rows.map((r) => r.volume)).toEqual([100, 200]);
    expect(rows[0].symbol).toBe('600519.SH');
    expect(rows[0].polled_at).toBe(new Date(polledAt).toISOString());
  });
});
