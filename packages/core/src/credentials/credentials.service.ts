import type { CredentialsApi, CredentialsStatus } from '../contract/credentials.js';
import { locateLongbridgeCli } from '../marketdata/longbridgeCli.js';
import { readLongbridgeToken, LongbridgeTokenError } from '../marketdata/longbridgeToken.js';
import { resolveProviderName } from '../marketdata/registry.js';
import { ricequantConfigured } from '../marketdata/ricequantBridge.js';
import type { Market } from '../symbols/symbol.utils.js';
import { probeOpencli } from './opencli.js';

const MARKETS: Market[] = ['US', 'HK', 'CN'];

async function longbridgeStatus(): Promise<CredentialsStatus> {
  let cliPath: string;
  try {
    cliPath = await locateLongbridgeCli();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      configured: false,
      method: 'cli',
      lastError: message,
      state: 'cli_missing' as const,
      cliPath: null,
    };
  }
  try {
    await readLongbridgeToken();
    return { configured: true, method: 'cli', lastError: null, state: 'ready' as const, cliPath };
  } catch (error) {
    const state =
      error instanceof LongbridgeTokenError && error.code === 'NOT_LOGGED_IN'
        ? ('login_required' as const)
        : ('token_unreadable' as const);
    const message = error instanceof Error ? error.message : String(error);
    return { configured: false, method: 'cli', lastError: message, state, cliPath };
  }
}

export const credentialsService: CredentialsApi = {
  async status() {
    const longbridge = await longbridgeStatus();
    if (longbridge.configured) return longbridge;
    // 只用米筐看 A 股时不必装长桥：有市场路由到米筐、且本机配好了米筐，就算数据已连接。
    const usesRicequant = MARKETS.some((market) => resolveProviderName(market) === 'ricequant');
    if (usesRicequant && ricequantConfigured().ok) {
      return {
        configured: true,
        method: 'ricequant',
        lastError: null,
        state: 'ready',
        cliPath: null,
      };
    }
    return longbridge;
  },
  opencliStatus() {
    return probeOpencli();
  },
};
