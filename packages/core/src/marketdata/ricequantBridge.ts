import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { PROJECT_ROOT } from '../platform/env.js';

// 米筐桥：一个常驻的 Python 子进程（packages/core/rq-bridge/rq_bridge.py），
// 只 init 一次 rqdatac，之后所有请求复用同一条连接。
// 不用「每次调用起一个进程」的做法：rqdatac 每次 init 约 1 秒，还会多占一条 license 连接。

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_LICENSE_FILE = join(homedir(), '.config', 'kansoku', 'rq_license');

export class RicequantBridgeError extends Error {
  constructor(
    message: string,
    readonly code: 'BRIDGE_UNAVAILABLE' | 'BRIDGE_FAILED' | 'BRIDGE_TIMEOUT',
  ) {
    super(message);
    this.name = 'RicequantBridgeError';
  }
}

export interface RicequantBridgeConfig {
  python: string;
  script: string;
  licenseFile: string;
}

function expandHome(path: string): string {
  return path.startsWith('~/') ? join(homedir(), path.slice(2)) : path;
}

export function ricequantConfig(env: NodeJS.ProcessEnv = process.env): RicequantBridgeConfig {
  return {
    python: expandHome(env.RQ_PYTHON || 'python3'),
    script: expandHome(
      env.RQ_BRIDGE_PATH || join(PROJECT_ROOT, 'packages', 'core', 'rq-bridge', 'rq_bridge.py'),
    ),
    licenseFile: expandHome(env.RQ_LICENSE_FILE || DEFAULT_LICENSE_FILE),
  };
}

/** 本机是否具备启动米筐桥的条件（不启动进程，只看文件） */
export function ricequantConfigured(env: NodeJS.ProcessEnv = process.env): {
  ok: boolean;
  reason: string | null;
} {
  const config = ricequantConfig(env);
  if (!existsSync(config.licenseFile))
    return { ok: false, reason: `米筐 license 文件不存在：${config.licenseFile}` };
  if (!existsSync(config.script))
    return { ok: false, reason: `米筐桥脚本不存在：${config.script}` };
  return { ok: true, reason: null };
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export type RicequantCall = <T>(method: string, params?: Record<string, unknown>) => Promise<T>;

export class RicequantBridge {
  private child: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;

  constructor(
    private readonly config: () => RicequantBridgeConfig = () => ricequantConfig(),
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = this.ensureChild();
    } catch (error) {
      return Promise.reject(error);
    }
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new RicequantBridgeError(`米筐 ${method} 超时（${this.timeoutMs}ms）`, 'BRIDGE_TIMEOUT'),
        );
      }, this.timeoutMs);
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  private ensureChild(): ChildProcessWithoutNullStreams {
    if (this.child) return this.child;
    const config = this.config();
    if (!existsSync(config.script)) {
      throw new RicequantBridgeError(`米筐桥脚本不存在：${config.script}`, 'BRIDGE_UNAVAILABLE');
    }
    const child = spawn(config.python, ['-I', config.script], {
      env: { ...process.env, RQ_LICENSE_FILE: config.licenseFile, PYTHONUNBUFFERED: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;

    createInterface({ input: child.stdout }).on('line', (line) => this.handleLine(line));
    createInterface({ input: child.stderr }).on('line', (line) => {
      if (line.trim()) console.warn(line.startsWith('[rq-bridge]') ? line : `[rq-bridge] ${line}`);
    });
    const onGone = (reason: string) => {
      if (this.child !== child) return;
      this.child = null;
      this.failAll(new RicequantBridgeError(`米筐桥进程退出：${reason}`, 'BRIDGE_UNAVAILABLE'));
    };
    child.on('error', (error) => onGone(error.message));
    child.on('exit', (code, signal) => onGone(signal ? `signal ${signal}` : `exit ${code}`));
    child.stdin.on('error', () => {});
    return child;
  }

  private handleLine(line: string): void {
    let message: { id?: number; ok?: boolean; data?: unknown; error?: string };
    try {
      message = JSON.parse(line);
    } catch {
      console.warn('[rq-bridge] non-json stdout line ignored');
      return;
    }
    if (typeof message.id !== 'number') return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.ok) pending.resolve(message.data);
    else
      pending.reject(new RicequantBridgeError(message.error ?? 'unknown error', 'BRIDGE_FAILED'));
  }

  private failAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }

  close(): void {
    const child = this.child;
    this.child = null;
    this.failAll(new RicequantBridgeError('米筐桥已关闭', 'BRIDGE_UNAVAILABLE'));
    child?.stdin.end();
    child?.kill();
  }
}

let shared: RicequantBridge | null = null;

export function getRicequantBridge(): RicequantBridge {
  if (!shared) shared = new RicequantBridge();
  return shared;
}

export function resetRicequantBridge(): void {
  shared?.close();
  shared = null;
}
