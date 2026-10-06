import { marketOfSymbol } from '../../lib/market';

export function symbolLabel(sym: string): string {
  return sym.toUpperCase().replace(/\.US$/, '');
}

// A 股代码不好认：有中文名时返回名字，其它市场沿用代码本身
export function cnSymbolName(sym: string, name: string | null | undefined): string | null {
  if (marketOfSymbol(sym) !== 'CN' || !name) return null;
  const trimmed = name.trim();
  return trimmed && trimmed.toUpperCase() !== symbolLabel(sym) ? trimmed : null;
}

export function symbolTitle(sym: string, name: string | null | undefined): string {
  const cnName = cnSymbolName(sym, name);
  return cnName ? `${cnName} ${symbolLabel(sym)}` : symbolLabel(sym);
}
