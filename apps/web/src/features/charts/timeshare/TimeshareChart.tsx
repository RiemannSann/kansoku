import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import * as stylex from '@stylexjs/stylex';
import type { Timeshare } from '@kansoku/shared/types';
import { useWsChannel } from '@web/lib/ws/useWsChannel';
import { theme } from '@web/lib/theme';
import { Empty, NoteBlock } from '@web/ui';
import { colors, fontSizes, fonts } from '../../../theme/tokens.stylex';
import { tooltipContentStyle, tooltipItemStyle, tooltipLabelStyle } from '../simple/theme';
import { buildTimeshareView, slotClock, SLOTS, X_TICKS } from './timeshareView';

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    minWidth: 0,
    padding: '8px 4px 4px 0',
  },
  head: {
    alignItems: 'baseline',
    color: colors.textSecondary,
    display: 'flex',
    flexWrap: 'wrap',
    fontSize: fontSizes.caption,
    gap: '14px',
    padding: '0 12px 6px',
  },
  value: {
    fontFamily: fonts.mono,
    fontVariantNumeric: 'tabular-nums',
  },
  price: { flex: '7 1 0', minHeight: 0 },
  volume: { flex: '2 1 0', minHeight: 0 },
  up: { color: colors.up },
  down: { color: colors.down },
  avg: { color: colors.accent },
});

const AXIS_TICK = { fill: theme.textSecondary, fontSize: 11 };
const Y_WIDTH = 64;

const lots = (shares: number) => `${Math.round(shares / 100).toLocaleString()}手`;

/** A 股分时图：价格线 + 均价线（黄）+ 昨收中线，下面是每分钟成交量；横轴固定 09:30–15:00 */
export function TimeshareChart({ symbol }: { symbol: string }) {
  const [data, setData] = useState<Timeshare | null>(null);
  useEffect(() => setData(null), [symbol]);
  const { degraded } = useWsChannel<Timeshare>({ kind: 'timeshare', symbol }, setData);

  if (!data) return <Empty>分时加载中…</Empty>;
  if (!data.date) return <Empty>还没有分时数据</Empty>;

  const view = buildTimeshareView(data);
  const prev = view.prevClose;
  const pctOf = (price: number) => (prev ? (price / prev - 1) * 100 : 0);
  const pctText = (price: number) => `${pctOf(price) >= 0 ? '+' : ''}${pctOf(price).toFixed(2)}%`;
  const last = view.last;
  const lastTone =
    last?.price != null && prev != null && last.price < prev ? styles.down : styles.up;
  const digits = (prev ?? last?.price ?? 0) < 10 ? 3 : 2;
  const xTicks = X_TICKS.map((t) => t.slot);
  const xLabel = (slot: number) => X_TICKS.find((t) => t.slot === slot)?.label ?? '';

  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.head)}>
        <span>分时 {data.date}</span>
        {last?.price != null && (
          <span {...stylex.props(styles.value, lastTone)}>
            {last.price.toFixed(digits)} {prev ? pctText(last.price) : ''}
          </span>
        )}
        {last?.avg != null && (
          <span>
            均价 <span {...stylex.props(styles.value, styles.avg)}>{last.avg.toFixed(digits)}</span>
          </span>
        )}
        {prev != null && (
          <span>
            昨收 <span {...stylex.props(styles.value)}>{prev.toFixed(digits)}</span>
          </span>
        )}
      </div>
      {data.partial && (
        <NoteBlock>当天分钟线没取到，只显示打开页面之后用实时快照拼出来的走势</NoteBlock>
      )}
      {degraded && <NoteBlock>分钟线暂时取不到，正在重试</NoteBlock>}
      <div {...stylex.props(styles.price)}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={view.rows}
            margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
            syncId="timeshare"
          >
            <CartesianGrid stroke={theme.gridLine} />
            <XAxis
              dataKey="slot"
              type="number"
              domain={[-0.5, SLOTS - 0.5]}
              ticks={xTicks}
              tickFormatter={xLabel}
              tick={false}
              axisLine={{ stroke: theme.borderStrong }}
              height={1}
            />
            <YAxis
              yAxisId="price"
              domain={view.domain}
              ticks={view.ticks}
              tickFormatter={(v: number) => v.toFixed(digits)}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={Y_WIDTH}
            />
            <YAxis
              yAxisId="pct"
              orientation="right"
              domain={view.domain}
              ticks={view.ticks}
              tickFormatter={(v: number) => pctText(v)}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={Y_WIDTH}
            />
            {prev != null && (
              <ReferenceLine
                yAxisId="price"
                y={prev}
                stroke={theme.textMuted}
                strokeDasharray="4 3"
              />
            )}
            <Tooltip
              contentStyle={tooltipContentStyle}
              labelStyle={tooltipLabelStyle}
              itemStyle={tooltipItemStyle}
              labelFormatter={(slot) => slotClock(Number(slot))}
              formatter={(value, name) => {
                const v = Number(value);
                return name === 'avg'
                  ? [v.toFixed(digits), '均价']
                  : [`${v.toFixed(digits)}（${pctText(v)}）`, '价格'];
              }}
            />
            <Line
              yAxisId="price"
              dataKey="price"
              stroke={theme.textPrimary}
              strokeWidth={1.2}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
            <Line
              yAxisId="price"
              dataKey="avg"
              stroke={theme.accent}
              strokeWidth={1}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
            {/* 右轴（涨跌幅）要绑一条线才会画出来；这条线本身不可见、不进提示框 */}
            <Line
              yAxisId="pct"
              dataKey="price"
              stroke="transparent"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              tooltipType="none"
              legendType="none"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div {...stylex.props(styles.volume)}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={view.rows}
            margin={{ top: 4, right: Y_WIDTH, bottom: 0, left: 0 }}
            syncId="timeshare"
            barCategoryGap={0}
          >
            <CartesianGrid stroke={theme.gridLine} vertical={false} />
            <XAxis
              dataKey="slot"
              type="number"
              domain={[-0.5, SLOTS - 0.5]}
              ticks={xTicks}
              tickFormatter={xLabel}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: theme.borderStrong }}
              interval={0}
            />
            <YAxis
              tickFormatter={(v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(0)}万手` : lots(v))}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={Y_WIDTH}
              tickCount={3}
            />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              contentStyle={tooltipContentStyle}
              labelStyle={tooltipLabelStyle}
              itemStyle={tooltipItemStyle}
              labelFormatter={(slot) => slotClock(Number(slot))}
              formatter={(value) => [lots(Number(value)), '成交量']}
            />
            <Bar dataKey="volume" isAnimationActive={false}>
              {view.rows.map((row) => (
                <Cell key={row.slot} fill={row.tone === 'up' ? theme.up : theme.down} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
