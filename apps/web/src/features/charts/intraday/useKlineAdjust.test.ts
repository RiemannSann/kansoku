// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseAdjust, useKlineAdjust } from './useKlineAdjust';

beforeEach(() => localStorage.clear());

describe('useKlineAdjust', () => {
  it('defaults to 前复权 and only understands the three values', () => {
    expect(parseAdjust(null)).toBe('pre');
    expect(parseAdjust('qfq')).toBe('pre');
    expect(parseAdjust('post')).toBe('post');
  });

  it('remembers the A-share choice and stays 前复权 for other markets', () => {
    const cn = renderHook(() => useKlineAdjust('600519.SH'));
    expect(cn.result.current).toMatchObject({ available: true, adjust: 'pre' });
    act(() => cn.result.current.setAdjust('none'));
    expect(cn.result.current.adjust).toBe('none');
    expect(renderHook(() => useKlineAdjust('000001.SZ')).result.current.adjust).toBe('none');
    expect(renderHook(() => useKlineAdjust('NVDA.US')).result.current).toMatchObject({
      available: false,
      adjust: 'pre',
    });
  });
});
