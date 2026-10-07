import type { ReactNode } from 'react';
import type { IntradayBuilt, KlineAdjust, TimeframeKey } from '@kansoku/shared/types';
import * as stylex from '@stylexjs/stylex';
import type { SidebarTab } from '../SidebarTabs';
import type { ConclusionReassess } from './ConclusionCard';
import { IntradayChartOnly } from './IntradayChartOnly';
import { IntradaySidebar } from './IntradaySidebar';
import { useIntradayControls } from './controlsContext';
import { TimeframeSettingsMenu } from './TimeframeSettingsMenu';
import { ADJUST_OPTIONS } from './useKlineAdjust';
import { isViewPeriod, tfLabel, tfShortLabel, type ChartTf } from './timeframes';
import { colors, fontSizes, radii, sizes } from '../../../theme/tokens.stylex';

export const TF_LABELS: Record<TimeframeKey, string> = { m5: '5分钟', m15: '15分钟', h1: '1小时' };

const styles = stylex.create({
  layout: {
    display: 'grid',
    gridTemplateColumns: `1fr ${sizes.sidebarWidth}`,
    height: '100%',
    position: 'relative',
  },
  timeframeSwitch: {
    display: 'inline-flex',
    gap: '2px',
    padding: '2px',
    backgroundColor: colors.backgroundCanvas,
    borderColor: colors.border,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: radii.default,
  },
  timeframeButton: {
    'minWidth': '30px',
    'height': '20px',
    'padding': '0 7px',
    'backgroundColor': 'transparent',
    'borderStyle': 'none',
    'borderWidth': 0,
    'borderRadius': radii.default,
    'color': colors.textSecondary,
    'fontSize': fontSizes.sm,
    'fontVariantNumeric': 'tabular-nums',
    'lineHeight': '20px',
    'cursor': 'pointer',
    ':hover': {
      color: colors.textPrimary,
      backgroundColor: colors.backgroundHover,
    },
  },
  timeframeButtonActive: {
    color: colors.textPrimary,
    backgroundColor: colors.backgroundHover,
  },
  adjustDivider: {
    alignSelf: 'center',
    backgroundColor: colors.border,
    height: '12px',
    margin: '0 2px',
    width: '1px',
  },
});

export { IntradayChartOnly } from './IntradayChartOnly';

interface IntradayDashboardProps {
  symbol: string;
  built: IntradayBuilt;
  activeTf: ChartTf;
  predictionUpdatedAt?: string;
  predictionStale?: boolean;
  conclusionReassess?: ConclusionReassess;
  onLoadHistory?: () => void;
  sidebarTabs?: SidebarTab[];
  extraTabs?: SidebarTab[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
  dock?: ReactNode;
  live?: boolean;
  /** 替换主图（A 股分时图） */
  chartOverride?: ReactNode;
}

export function IntradayTimeframeSwitch({
  activeTf,
  onChange,
  timeshare,
  adjust,
}: {
  activeTf: ChartTf;
  onChange: (tf: ChartTf) => void;
  /** A 股才有：最前面加一个「分时」按钮；分时打开时 K 线周期都不高亮 */
  timeshare?: { active: boolean; onSelect: () => void };
  /** A 股才有：复权方式。只在日 / 周 / 月等现拉的周期显示（5/15/60 分钟固定前复权，分时不复权） */
  adjust?: { value: KlineAdjust; onChange: (next: KlineAdjust) => void };
}) {
  const { visibleTfs } = useIntradayControls();
  const tfActive = (k: ChartTf) => !timeshare?.active && k === activeTf;
  return (
    <div
      className={`chart-timeframe-switch ${stylex.props(styles.timeframeSwitch).className}`}
      aria-label="时间周期"
    >
      {timeshare && (
        <button
          className={
            stylex.props(styles.timeframeButton, timeshare.active && styles.timeframeButtonActive)
              .className
          }
          aria-pressed={timeshare.active}
          onClick={timeshare.onSelect}
          title="分时图（价格 + 均价线，横轴 09:30–15:00）"
        >
          分时
        </button>
      )}
      {visibleTfs.map((k) => (
        <button
          key={k}
          className={
            stylex.props(styles.timeframeButton, tfActive(k) && styles.timeframeButtonActive)
              .className
          }
          aria-pressed={tfActive(k)}
          onClick={() => onChange(k)}
          title={tfLabel(k)}
        >
          {tfShortLabel(k)}
        </button>
      ))}
      {adjust && !timeshare?.active && isViewPeriod(activeTf) && (
        <>
          <span {...stylex.props(styles.adjustDivider)} aria-hidden />
          {ADJUST_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={
                stylex.props(
                  styles.timeframeButton,
                  adjust.value === opt.value && styles.timeframeButtonActive,
                ).className
              }
              aria-pressed={adjust.value === opt.value}
              onClick={() => adjust.onChange(opt.value)}
              title={opt.title}
            >
              {opt.label}
            </button>
          ))}
        </>
      )}
      <TimeframeSettingsMenu />
    </div>
  );
}

export function IntradayDashboard({
  symbol,
  built,
  activeTf,
  predictionUpdatedAt,
  predictionStale,
  conclusionReassess,
  onLoadHistory,
  sidebarTabs,
  extraTabs,
  activeTab,
  onTabChange,
  dock,
  live,
  chartOverride,
}: IntradayDashboardProps) {
  const sidebarTf = isViewPeriod(activeTf) ? built.defaultTf : activeTf;
  return (
    <div className={`layout ${stylex.props(styles.layout).className}`}>
      {chartOverride ?? (
        <IntradayChartOnly
          symbol={symbol}
          built={built}
          activeTf={activeTf}
          onLoadHistory={onLoadHistory}
          live={live}
        />
      )}
      <IntradaySidebar
        built={built}
        activeTf={sidebarTf}
        predictionUpdatedAt={predictionUpdatedAt}
        predictionStale={predictionStale}
        conclusionReassess={conclusionReassess}
        tabsOverride={sidebarTabs}
        extraTabs={extraTabs}
        active={activeTab}
        onActiveChange={onTabChange}
        dock={dock}
        live={live}
      />
    </div>
  );
}
