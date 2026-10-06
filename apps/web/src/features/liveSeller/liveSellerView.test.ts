import { describe, expect, it } from 'vitest';
import { cellTone, headerLabel, isNumericHeader } from './liveSellerView';

describe('live seller view rules', () => {
  it('colors only the return columns by sign', () => {
    expect(cellTone('Ret', '+0.67%')).toBe('up');
    expect(cellTone('Now%', '-1.20%')).toBe('down');
    expect(cellTone('EstNow%', '-')).toBeNull();
    expect(cellTone('Ret', '0.00%')).toBeNull();
    expect(cellTone('Notional', '-5')).toBeNull();
  });

  it('right-aligns numeric columns, including per-box remaining', () => {
    expect(isNumericHeader('OS Rem/Init')).toBe(true);
    expect(isNumericHeader('Avg Px')).toBe(true);
    expect(isNumericHeader('Name')).toBe(false);
  });

  it('translates known headers and keeps unknown ones', () => {
    expect(headerLabel('Notional')).toBe('金额');
    expect(headerLabel('OS3 Rem/Init')).toBe('OS3 Rem/Init');
  });
});
