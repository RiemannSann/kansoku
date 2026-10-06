import { describe, expect, it, vi } from 'vitest';
import {
  applyColorConvention,
  BASE_DOWN,
  BASE_UP,
  COLOR_CONVENTION_STORAGE_KEY,
  readColorConvention,
  setColorConvention,
  swapUpDown,
} from './colorConvention';

describe('color convention preference', () => {
  it('defaults to green-up and restores red-up from storage', () => {
    expect(readColorConvention(null)).toBe('green-up');
    expect(readColorConvention({ getItem: () => 'unexpected' })).toBe('green-up');
    expect(
      readColorConvention({
        getItem: (key: string) => (key === COLOR_CONVENTION_STORAGE_KEY ? 'red-up' : null),
      }),
    ).toBe('red-up');
  });

  it('reloads the page only when the choice differs from what this load renders', () => {
    const reload = vi.fn();
    setColorConvention('red-up', reload);
    expect(reload).toHaveBeenCalledTimes(1);
    setColorConvention('green-up', reload);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('up/down color swap', () => {
  it('trades the two colors in hex and rgb(a) form, leaving others alone', () => {
    expect(swapUpDown(BASE_UP, true)).toBe(BASE_DOWN);
    expect(swapUpDown('#EF5350', true)).toBe(BASE_UP);
    expect(swapUpDown('rgba(38, 166, 154, 0.20)', true)).toBe('rgba(239, 83, 80, 0.20)');
    expect(swapUpDown('rgba(239,83,80,0.16)', true)).toBe('rgba(38, 166, 154,0.16)');
    expect(swapUpDown('#ffb000', true)).toBe('#ffb000');
    expect(swapUpDown(BASE_UP, false)).toBe(BASE_UP);
  });

  it('swaps every color inside chart payloads without mutating them', () => {
    const payload = {
      volumes: [{ time: 1, value: 5, color: BASE_UP }],
      macdHist: [{ time: 1, value: -1, color: BASE_DOWN }],
      zones: [{ fill: 'rgba(38, 166, 154, 0.2)', border: '#26a69a', label: '第一买点' }],
      count: 3,
      empty: null,
    };
    const swapped = applyColorConvention(payload, true);
    expect(swapped).toEqual({
      volumes: [{ time: 1, value: 5, color: BASE_DOWN }],
      macdHist: [{ time: 1, value: -1, color: BASE_UP }],
      zones: [{ fill: 'rgba(239, 83, 80, 0.2)', border: BASE_DOWN, label: '第一买点' }],
      count: 3,
      empty: null,
    });
    expect(payload.volumes[0]!.color).toBe(BASE_UP);
    expect(applyColorConvention(payload, false)).toBe(payload);
  });
});
