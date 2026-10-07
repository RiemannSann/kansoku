import { describe, expect, it } from 'vitest';
import { normalizeSymbol, symbolFromRoute } from './symbol';

describe('normalizeSymbol', () => {
  it('keeps bare US tickers on .US', () => {
    expect(normalizeSymbol('mrvl')).toBe('MRVL.US');
  });

  it('maps a bare six-digit code to its A-share exchange', () => {
    expect(normalizeSymbol('600487')).toBe('600487.SH');
    expect(normalizeSymbol(' 002050 ')).toBe('002050.SZ');
    expect(symbolFromRoute('/symbol/300750')).toBe('300750.SZ');
  });
});
