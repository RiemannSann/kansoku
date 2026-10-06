import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { PROJECT_ROOT } from '@kansoku/core/platform/env';

// 用户级配置：打包后的 App 没有仓库根目录的 .env，行情源、米筐路径、实盘看板地址
// 这类本机设置统一放这里（KANSOKU_ENV_FILE 可以改位置）。仓库 .env 里已有的键优先。
export function userEnvFile(env: NodeJS.ProcessEnv = process.env): string {
  return env.KANSOKU_ENV_FILE || join(homedir(), '.config', 'kansoku', 'kansoku.env');
}

export function loadDotenv(path = join(PROJECT_ROOT, '.env')): void {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch {
    return;
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
