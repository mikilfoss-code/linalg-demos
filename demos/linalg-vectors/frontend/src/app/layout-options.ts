import { logLayoutWarnings, resolveLayoutProfile } from '@shared/lib/layout-runtime';
import {
  LAYOUT_SCHEMA_VERSION,
  type LayoutMode,
  type LayoutSchema,
} from '@shared/lib/layout-schema';

export type VectorsPanelId =
  | 'grid'
  | 'vector'
  | 'selected'
  | 'vectorWindow'
  | 'slider'
  | 'components'
  | 'debug';

/**
 * Internal layout toggle for vectors demo.
 * Update to `sideBySide` to restore the original split layout.
 */
export const VECTORS_LAYOUT_MODE: LayoutMode = 'stackedVertical';

/**
 * Internal toggle controlling whether the debug panel is rendered.
 */
export const INCLUDE_DEBUG_PANEL = true;

export const VECTORS_LAYOUT_SCHEMA: LayoutSchema<VectorsPanelId> = {
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  defaultVariantId: 'sideBySide',
  panels: [
    { id: 'grid' },
    { id: 'vector' },
    { id: 'selected', parentId: 'vector' },
    { id: 'vectorWindow', parentId: 'vector' },
    { id: 'slider', parentId: 'vectorWindow' },
    { id: 'components', parentId: 'vectorWindow' },
    { id: 'debug' },
  ],
  variants: [
    {
      id: 'sideBySide',
      containerClassName: 'layout--side-by-side',
      placements: [
        { panelId: 'grid', order: 1, width: '56%', maxWidth: '100%' },
        {
          panelId: 'vector',
          order: 2,
          width: '44%',
          maxWidth: '100%',
          childrenLayout: {
            mode: 'grid',
            columns: '34% 66%',
            gap: 'var(--base-space-4)',
            alignItems: 'start',
          },
        },
        { panelId: 'selected', order: 1 },
        {
          panelId: 'vectorWindow',
          order: 2,
          childrenLayout: {
            mode: 'grid',
            columns: '72px 1fr',
            gap: 'var(--base-space-3)',
            alignItems: 'start',
          },
        },
        { panelId: 'slider', order: 1, maxWidth: '100%' },
        { panelId: 'components', order: 2, maxWidth: '100%' },
        { panelId: 'debug', order: 3 },
      ],
      responsiveFallbacks: [
        {
          panelId: 'vector',
          maxPanelWidthPx: 430,
          fallbackVariantId: 'stackedVertical',
          hysteresisPx: 42,
        },
      ],
    },
    {
      id: 'stackedVertical',
      containerClassName: 'layout--stacked-vertical',
      placements: [
        {
          panelId: 'vector',
          order: 1,
          width: '100%',
          maxWidth: '100%',
          childrenLayout: {
            mode: 'grid',
            columns: '100%',
            gap: 'var(--base-space-4)',
          },
        },
        { panelId: 'grid', order: 2, width: '100%', maxWidth: '100%' },
        { panelId: 'selected', order: 1 },
        {
          panelId: 'vectorWindow',
          order: 2,
          childrenLayout: {
            mode: 'grid',
            columns: '72px 1fr',
            gap: 'var(--base-space-3)',
            alignItems: 'start',
          },
        },
        { panelId: 'slider', order: 1, maxWidth: '100%' },
        { panelId: 'components', order: 2, maxWidth: '100%' },
        { panelId: 'debug', order: 3 },
      ],
    },
  ],
};

export const VECTORS_FALLBACK_VARIANTS = {
  sideBySide: {
    variantId: 'sideBySide',
    containerClassName: 'layout--side-by-side',
    panelOrder: [
      'grid',
      'vector',
      'selected',
      'vectorWindow',
      'slider',
      'components',
      'debug',
    ] as const,
  },
  stackedVertical: {
    variantId: 'stackedVertical',
    containerClassName: 'layout--stacked-vertical',
    panelOrder: [
      'vector',
      'grid',
      'selected',
      'vectorWindow',
      'slider',
      'components',
      'debug',
    ] as const,
  },
} satisfies Record<
  LayoutMode,
  {
    variantId: string;
    containerClassName: string;
    panelOrder: readonly VectorsPanelId[];
  }
>;

const vectorsFallbackVariant = VECTORS_FALLBACK_VARIANTS[VECTORS_LAYOUT_MODE];

const resolvedVectorsLayoutProfile = resolveLayoutProfile({
  schema: VECTORS_LAYOUT_SCHEMA,
  variantId: VECTORS_LAYOUT_MODE,
  fallbackVariant: vectorsFallbackVariant,
});

logLayoutWarnings('vectors-layout', resolvedVectorsLayoutProfile.warnings);

/**
 * Active layout profile selected by `VECTORS_LAYOUT_MODE`.
 */
export const ACTIVE_VECTORS_LAYOUT_PROFILE = resolvedVectorsLayoutProfile;
