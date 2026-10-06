// A 股看盘时段（北京时间工作日 09:15–15:00，含集合竞价和午休）。
// 午休也算：11:30–13:00 同花顺照样停在看盘界面显示上午收盘的价，不该切去收盘复盘。
// 不认节假日：节假日里会按盘中布局显示，但行情停在上一个交易日，不影响数据。
const SHANGHAI_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Shanghai',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function isCnTradingTime(now: Date = new Date()): boolean {
  const parts = Object.fromEntries(
    SHANGHAI_PARTS.formatToParts(now).map((part) => [part.type, part.value]),
  );
  if (parts.weekday === 'Sat' || parts.weekday === 'Sun') return false;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return minutes >= 9 * 60 + 15 && minutes < 15 * 60;
}

/**
 * 首页用「看盘」还是「收盘复盘」布局。美股时段只有在关注了美股时才算数：
 * 只看 A 股时，北京时间晚上美股盘前不该把首页切回看盘布局。
 */
export function homeTradingLayout(
  usSession: string | null,
  watchedMarkets: readonly string[] | null | undefined,
  now: Date = new Date(),
): { trading: boolean; overnightLabel: boolean } {
  const markets = watchedMarkets?.length ? watchedMarkets : ['US'];
  const usLive = markets.includes('US') && (usSession === 'pre' || usSession === 'regular');
  const cnLive = markets.includes('CN') && isCnTradingTime(now);
  return { trading: usLive || cnLive, overnightLabel: usLive && usSession === 'pre' && !cnLive };
}
