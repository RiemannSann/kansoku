import { marketOfSymbol } from '@web/lib/market';
import { useCapabilities } from './capabilitiesStore';

const PROVIDER_LABELS: Record<string, string> = {
  longbridge: '长桥证券',
  ricequant: '米筐',
};

export function dataSourceLabel(provider: string | undefined): string {
  return PROVIDER_LABELS[provider ?? 'longbridge'] ?? provider ?? PROVIDER_LABELS.longbridge;
}

/** 这只票的行情实际来自哪家（A 股可能走米筐，其余走长桥） */
export function useDataSourceLabel(symbol: string | null | undefined): string {
  const { marketProviders } = useCapabilities();
  return dataSourceLabel(marketProviders?.[marketOfSymbol(symbol)]);
}
