import type { LicenseSnapshot } from '@kansoku/pro-api';
import type { FeatureKey, FeatureState } from '@kansoku/pro-api/features';
import { defineRoutes } from './defineRoutes.js';

export interface CapabilitiesOut {
  pro: boolean;
  licensed: boolean;
  license?: LicenseSnapshot;
  features: Record<FeatureKey, FeatureState>;
  hasEncBundle?: boolean;
  /** 各市场实际使用的行情源（longbridge / ricequant），前端用来标注数据来源 */
  marketProviders?: Record<'US' | 'HK' | 'CN', string>;
}

export interface CapabilitiesApi {
  get(): Promise<CapabilitiesOut>;
}

export const capabilitiesRoutes = defineRoutes<CapabilitiesApi>('capabilities', {
  get: { method: 'GET', path: '/' },
});
