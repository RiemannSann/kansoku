import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { RicequantBridge } from '../src/marketdata/ricequantBridge.js';

// 假的桥：收到 hang 就一直卡住不回，其它请求回一个带进程号的应答
const FAKE_BRIDGE = `
import json, os, sys, time
for line in sys.stdin:
    req = json.loads(line)
    if req["method"] == "hang":
        time.sleep(60)
    sys.stdout.write(json.dumps({"id": req["id"], "ok": True, "data": os.getpid()}) + "\\n")
    sys.stdout.flush()
`;

let bridge: RicequantBridge | null = null;

afterEach(() => {
  bridge?.close();
  bridge = null;
});

describe('ricequant bridge process', () => {
  it('restarts a bridge that stopped answering instead of queueing behind it', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'rq-bridge-'));
    const script = path.join(dir, 'fake_bridge.py');
    writeFileSync(script, FAKE_BRIDGE);
    bridge = new RicequantBridge(
      () => ({ python: 'python3', script, licenseFile: path.join(dir, 'none') }),
      400,
    );

    const firstPid = await bridge.call<number>('ping');
    await expect(bridge.call('hang')).rejects.toMatchObject({ code: 'BRIDGE_TIMEOUT' });
    const secondPid = await bridge.call<number>('ping');
    expect(secondPid).not.toBe(firstPid);
  });
});
