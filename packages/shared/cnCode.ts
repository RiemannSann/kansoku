/**
 * 同花顺习惯直接敲 6 位代码（600487 / 000001 / 510300），这里按代码段补上交易所后缀：
 * 6 开头（主板、科创板）和 5 开头（沪市基金 / ETF）→ .SH；0、3 开头（主板、创业板）和 1 开头（深市基金 / ETF）→ .SZ。
 * 北交所（4 / 8 / 920 开头）还不支持，返回 null，交给调用方按原来的规则处理。
 * 注意 000001 按股票算成平安银行；上证指数要写 000001.SH。
 */
export function suffixBareCnCode(code: string): string | null {
  if (!/^\d{6}$/.test(code)) return null;
  const head = code[0];
  if (head === '6' || head === '5') return `${code}.SH`;
  if (head === '0' || head === '3' || head === '1') return `${code}.SZ`;
  return null;
}
