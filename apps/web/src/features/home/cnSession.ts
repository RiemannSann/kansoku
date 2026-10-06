// A 股盘中（北京时间工作日 09:15–11:30、13:00–15:00，含集合竞价）。
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
  return (
    (minutes >= 9 * 60 + 15 && minutes < 11 * 60 + 30) || (minutes >= 13 * 60 && minutes < 15 * 60)
  );
}
