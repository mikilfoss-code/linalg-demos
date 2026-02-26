import { logLayoutWarnings, resolveLayoutProfile } from '@shared/lib/layout-runtime';
import {
  LAYOUT_SCHEMA_VERSION,
  type LayoutMode,
  type LayoutSchema,
} from '@shared/lib/layout-schema';

export type MarkovPanelId = 'top' | 'graph' | 'state' | 'matrix';

/**
 * Internal layout toggle for the Markov demo.
 */
export const MARKOV_LAYOUT_MODE: LayoutMode = 'sideBySide';

export const MARKOV_LAYOUT_SCHEMA: LayoutSchema<MarkovPanelId> = {
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  defaultVariantId: 'sideBySide',
  panels: [
    { id: 'top' },
    { id: 'graph', parentId: 'top' },
    { id: 'state', parentId: 'top' },
    { id: 'matrix' },
  ],
  variants: [
    {
      id: 'sideBySide',
      containerClassName: 'markov-layout--side-by-side',
      placements: [
        {
          panelId: 'top',
          order: 1,
          childrenLayout: {
            mode: 'grid',
            columns: '66% 34%',
            gap: 'var(--base-space-5)',
            alignItems: 'start',
          },
        },
        { panelId: 'graph', order: 1 },
        { panelId: 'state', order: 2, width: '100%', maxWidth: '100%' },
        { panelId: 'matrix', order: 2, width: '100%', maxWidth: '100%' },
      ],
      responsiveFallbacks: [
        {
          panelId: 'state',
          maxPanelWidthPx: 380,
          fallbackVariantId: 'stackedVertical',
          hysteresisPx: 48,
        },
      ],
    },
    {
      id: 'stackedVertical',
      containerClassName: 'markov-layout--stacked-vertical',
      placements: [
        {
          panelId: 'top',
          order: 1,
          childrenLayout: {
            mode: 'grid',
            columns: '100%',
            gap: 'var(--base-space-5)',
          },
        },
        { panelId: 'graph', order: 1 },
        { panelId: 'state', order: 2, width: '100%', maxWidth: '100%' },
        { panelId: 'matrix', order: 2, width: '100%', maxWidth: '100%' },
      ],
    },
  ],
};

export const MARKOV_FALLBACK_VARIANTS = {
  sideBySide: {
    variantId: 'sideBySide',
    containerClassName: 'markov-layout--side-by-side',
    panelOrder: ['top', 'graph', 'state', 'matrix'] as const,
  },
  stackedVertical: {
    variantId: 'stackedVertical',
    containerClassName: 'markov-layout--stacked-vertical',
    panelOrder: ['top', 'graph', 'state', 'matrix'] as const,
  },
} satisfies Record<
  LayoutMode,
  {
    variantId: string;
    containerClassName: string;
    panelOrder: readonly MarkovPanelId[];
  }
>;

const resolvedMarkovLayoutProfile = resolveLayoutProfile({
  schema: MARKOV_LAYOUT_SCHEMA,
  variantId: MARKOV_LAYOUT_MODE,
  fallbackVariant: MARKOV_FALLBACK_VARIANTS[MARKOV_LAYOUT_MODE],
});

logLayoutWarnings('markov-layout', resolvedMarkovLayoutProfile.warnings);

/**
 * Active profile selected by `MARKOV_LAYOUT_MODE`.
 */
export const ACTIVE_MARKOV_LAYOUT_PROFILE = resolvedMarkovLayoutProfile;
