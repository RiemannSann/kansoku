import * as stylex from '@stylexjs/stylex';
import {
  setColorConvention,
  useStoredColorConvention,
  type ColorConvention,
} from '@web/lib/colorConvention';
import { SegmentedControl, type SegmentedControlOption } from '@web/ui';
import { SettingsGroup, SettingsRow } from './SettingsGroup';

const OPTIONS = [
  { value: 'green-up', label: '绿涨红跌' },
  { value: 'red-up', label: '红涨绿跌' },
] satisfies readonly SegmentedControlOption<ColorConvention>[];

const styles = stylex.create({
  mode: {
    'width': '168px',
    'flex': '0 0 auto',
    'gridTemplateColumns': '1fr 1fr',
    '@media (max-width: 560px)': { width: '100%' },
  },
});

export function ColorConventionSettingsCard() {
  const convention = useStoredColorConvention();

  return (
    <SettingsGroup name="涨跌颜色">
      <SettingsRow
        label="K 线和涨跌幅的配色"
        description="绿涨红跌是美股习惯；红涨绿跌是 A 股和同花顺的习惯。切换后页面会刷新一次。"
      >
        <SegmentedControl
          ariaLabel="涨跌颜色"
          className={stylex.props(styles.mode).className}
          value={convention}
          options={OPTIONS}
          onChange={(next) => setColorConvention(next)}
        />
      </SettingsRow>
    </SettingsGroup>
  );
}
