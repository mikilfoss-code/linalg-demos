import {
  createLayoutProfileStrategies,
  type LayoutMode,
} from '@shared/lib/layout-profiles';

export type VectorsPanelId = 'grid' | 'vector' | 'debug';

/**
 * Internal layout toggle for vectors demo.
 * Update to `sideBySide` to restore the original split layout.
 */
export const VECTORS_LAYOUT_MODE: LayoutMode = 'stackedVertical';

/**
 * Internal toggle controlling whether the debug panel is rendered.
 */
export const INCLUDE_DEBUG_PANEL = false;

/**
 * Layout profile strategies for vectors demo panel ordering.
 */
export const vectorsLayoutProfiles = createLayoutProfileStrategies<VectorsPanelId>({
  sideBySide: ['grid', 'vector', 'debug'],
  stackedVertical: ['vector', 'grid', 'debug'],
});

/**
 * Active layout profile selected by `VECTORS_LAYOUT_MODE`.
 */
export const ACTIVE_VECTORS_LAYOUT_PROFILE = vectorsLayoutProfiles.resolve(VECTORS_LAYOUT_MODE);
