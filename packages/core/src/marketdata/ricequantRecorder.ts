import { appendFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type { BridgeSnapshot } from './ricequant.js';
import { shanghaiDate } from './ricequantTime.js';

// 现场核对用的快照录盘：设了 KANSOKU_RQ_RECORD_SYMBOLS（逗号分隔，比如 600519.SH,000001.SZ）才开，
// 把轮询拿到的这几只票的原始快照（只记有变化的）按天追加到
// ${KANSOKU_RQ_RECORD_DIR:-~/.cache/kansoku/rq-record}/snapshots-YYYY-MM-DD.jsonl。
// 收盘后用 rq-bridge/build_replay_fixture.py --recording 把它和官方 1 分钟线拼成回放 fixture，
// 再跑 ricequantReplay.test.ts，就能核对"App 当天实际看到的快照"拼出来的 K 线对不对。
// 一只票一天约 4800 行、2 MB 左右。

export type SnapshotRecorder = (rows: BridgeSnapshot[], polledAt: number) => void;

export function createSnapshotRecorder(symbols: string[], dir: string): SnapshotRecorder {
  const wanted = new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean));
  const lastSignature = new Map<string, string>();
  let ready: Promise<unknown> = mkdir(dir, { recursive: true });
  let warned = false;
  return (rows, polledAt) => {
    const lines: string[] = [];
    for (const row of rows) {
      if (!wanted.has(row.symbol)) continue;
      const signature = `${row.datetime}|${row.last}|${row.volume}|${row.bids?.[0]}|${row.asks?.[0]}`;
      if (lastSignature.get(row.symbol) === signature) continue;
      lastSignature.set(row.symbol, signature);
      lines.push(JSON.stringify({ polled_at: new Date(polledAt).toISOString(), ...row }));
    }
    if (!lines.length) return;
    const file = path.join(dir, `snapshots-${shanghaiDate(polledAt)}.jsonl`);
    ready = ready
      .then(() => appendFile(file, `${lines.join('\n')}\n`))
      .catch((error: unknown) => {
        if (warned) return;
        warned = true;
        console.warn(
          '[ricequant-record] write failed:',
          error instanceof Error ? error.message : error,
        );
      });
  };
}

export function snapshotRecorderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): SnapshotRecorder | undefined {
  const symbols = env.KANSOKU_RQ_RECORD_SYMBOLS?.split(',').filter((s) => s.trim());
  if (!symbols?.length) return undefined;
  const dir = env.KANSOKU_RQ_RECORD_DIR || path.join(homedir(), '.cache', 'kansoku', 'rq-record');
  console.info(`[ricequant-record] recording ${symbols.join(',')} → ${dir}`);
  return createSnapshotRecorder(symbols, dir);
}
