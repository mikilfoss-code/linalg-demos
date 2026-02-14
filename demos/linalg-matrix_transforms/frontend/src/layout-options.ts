import {
  logLayoutWarnings,
  resolveLayoutProfile,
} from '@shared/lib/layout-runtime';
import {
  LAYOUT_SCHEMA_VERSION,
  type LayoutMode,
  type LayoutSchema,
} from '@shared/lib/layout-schema';

export type MatrixPanelId = 'controls' | 'output';

/**
 * Internal layout toggle for matrix transforms layout.
 */
export const MATRIX_LAYOUT_MODE: LayoutMode = 'stackedVertical';

const MATRIX_LAYOUT_SCHEMA: LayoutSchema<MatrixPanelId> = {
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  defaultVariantId: 'sideBySide',
  panels: [
    { id: 'controls' },
    { id: 'output' },
  ],
  variants: [
    {
      id: 'sideBySide',
      containerClassName: 'base-layout--side-by-side',
      placements: [
        { panelId: 'controls', order: 1 },
        { panelId: 'output', order: 2 },
      ],
    },
    {
      id: 'stackedVertical',
      containerClassName: 'base-layout--stacked-vertical',
      placements: [
        { panelId: 'controls', order: 1 },
        { panelId: 'output', order: 2 },
      ],
    },
  ],
};

const matrixFallbackVariants = {
  sideBySide: {
    variantId: 'sideBySide',
    containerClassName: 'base-layout--side-by-side',
    panelOrder: ['controls', 'output'] as const,
  },
  stackedVertical: {
    variantId: 'stackedVertical',
    containerClassName: 'base-layout--stacked-vertical',
    panelOrder: ['controls', 'output'] as const,
  },
} satisfies Record<LayoutMode, {
  variantId: string;
  containerClassName: string;
  panelOrder: readonly MatrixPanelId[];
}>;

const matrixFallbackVariant = matrixFallbackVariants[MATRIX_LAYOUT_MODE];

const resolvedMatrixLayoutProfile = resolveLayoutProfile({
  schema: MATRIX_LAYOUT_SCHEMA,
  variantId: MATRIX_LAYOUT_MODE,
  fallbackVariant: matrixFallbackVariant,
});

logLayoutWarnings('matrix-layout', resolvedMatrixLayoutProfile.warnings);

/**
 * Active layout profile selected by `MATRIX_LAYOUT_MODE`.
 */
export const ACTIVE_MATRIX_LAYOUT_PROFILE = resolvedMatrixLayoutProfile;


