import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/realtime/cnSectors.js', () => ({
  getSectorService: () => ({
    subscribeIndustry: (_symbol: string, push: (e: string) => void) => {
      push(JSON.stringify({ type: 'data', data: { ok: true } }));
      return () => {};
    },
  }),
}));

const { handleConnection, MAX_CHANNELS_PER_SOCKET } =
  await import('../src/realtime/channelProtocol.js');

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

describe('channels per connection', () => {
  it('serves a CN symbol page worth of channels (20+) on one connection', () => {
    expect(MAX_CHANNELS_PER_SOCKET).toBeGreaterThanOrEqual(32);
  });

  it('answers an over-cap subscription with a degraded status instead of dropping it silently', async () => {
    const sent: string[] = [];
    let onMessage: (text: string) => void = () => {};
    handleConnection({
      send: (text) => sent.push(text),
      onMessage: (cb) => {
        onMessage = cb;
      },
      onClose: () => {},
    });
    for (let i = 0; i <= MAX_CHANNELS_PER_SOCKET; i += 1) {
      onMessage(
        JSON.stringify({ op: 'sub', key: `k${i}`, kind: 'cn-industry', symbol: '600519.SH' }),
      );
      await settle();
    }
    const last = sent
      .map((s) => JSON.parse(s))
      .filter((m) => m.key === `k${MAX_CHANNELS_PER_SOCKET}`);
    expect(last).toHaveLength(1);
    expect(last[0].payload).toMatchObject({ type: 'status', degraded: true });
    expect(sent.filter((s) => s.includes('"type":"data"'))).toHaveLength(MAX_CHANNELS_PER_SOCKET);
  });
});
