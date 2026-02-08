import {
  createLayoutProfileStrategies,
  type LayoutMode,
} from '@shared/lib/layout-profiles';

type MatrixPanelId = 'controls' | 'output';

/**
 * Internal layout toggle for matrix transforms demo.
 */
export const MATRIX_LAYOUT_MODE: LayoutMode = 'stackedVertical';

/**
 * Layout profile strategies for matrix demo panels.
 */
const matrixLayoutProfiles = createLayoutProfileStrategies<MatrixPanelId>({
  sideBySide: ['controls', 'output'],
  stackedVertical: ['controls', 'output'],
  sideBySideClassName: 'demo-layout--side-by-side',
  stackedVerticalClassName: 'demo-layout--stacked-vertical',
});

/**
 * Active layout profile selected by `MATRIX_LAYOUT_MODE`.
 */
export const ACTIVE_MATRIX_LAYOUT_PROFILE = matrixLayoutProfiles.resolve(MATRIX_LAYOUT_MODE);
