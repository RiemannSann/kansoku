import { describe, expect, it } from 'vitest';
import { cnSymbolName, symbolTitle } from './symbolTitle';

describe('symbolTitle', () => {
  it('puts the Chinese name in front of A-share codes', () => {
    expect(symbolTitle('600487.SH', '亨通光电')).toBe('亨通光电 600487.SH');
    expect(cnSymbolName('600487.SH', '亨通光电')).toBe('亨通光电');
  });

  it('falls back to the code when there is no usable name', () => {
    expect(symbolTitle('600487.SH', null)).toBe('600487.SH');
    expect(symbolTitle('600487.SH', '600487.SH')).toBe('600487.SH');
  });

  it('leaves other markets on the bare ticker', () => {
    expect(symbolTitle('nvda.us', 'NVIDIA Corp')).toBe('NVDA');
    expect(cnSymbolName('700.HK', '腾讯控股')).toBeNull();
  });
});
