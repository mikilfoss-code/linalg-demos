import { logLayoutWarnings, resolveLayoutProfile } from '@shared/lib/layout-runtime';
import {
  LAYOUT_SCHEMA_VERSION,
  type LayoutMode,
  type LayoutSchema,
} from '@shared/lib/layout-schema';

export type NetworksPanelId = 'top' | 'controls' | 'graph' | 'flow' | 'bottom' | 'matrix' | 'spaces';

/**
 * Internal layout toggle for the networks demo.
 */
export const NETWORKS_LAYOUT_MODE: LayoutMode = 'sideBySide';

export const NETWORKS_LAYOUT_SCHEMA: LayoutSchema<NetworksPanelId> = {
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  defaultVariantId: 'sideBySide',
  panels: [
    { id: 'top' },
    { id: 'controls', parentId: 'top' },
    { id: 'graph', parentId: 'top' },
    { id: 'flow', parentId: 'controls' },
    { id: 'spaces', parentId: 'controls' },
    { id: 'bottom' },
    { id: 'matrix', parentId: 'bottom' },
  ],
  variants: [
    {
      id: 'sideBySide',
      containerClassName: 'networks-layout--side-by-side',
      placements: [
        {
          panelId: 'top',
          order: 1,
          childrenLayout: {
            mode: 'grid',
            columns: 'minmax(0, 1fr) var(--networks-controls-width)',
            gap: 'var(--networks-top-grid-gap)',
            alignItems: 'start',
          },
        },
        { panelId: 'graph', order: 1 },
        {
          panelId: 'controls',
          order: 2,
          childrenLayout: {
            mode: 'grid',
            rows: 'auto auto',
            gap: 'var(--base-space-5)',
          },
        },
        { panelId: 'flow', order: 1 },
        { panelId: 'spaces', order: 2 },
        {
          panelId: 'bottom',
          order: 2,
          childrenLayout: {
            mode: 'grid',
            columns: '100%',
          },
        },
        { panelId: 'matrix', order: 1 },
      ],
      responsiveFallbacks: [
        {
          maxContainerWidthPx: 980,
          fallbackVariantId: 'stackedVertical',
          hysteresisPx: 48,
        },
      ],
      tokens: {
        '--ui-button-bg': '#1f6f8b',
        '--ui-button-fg': '#f3fbff',
        '--ui-button-focus-ring': 'rgba(31, 111, 139, 0.32)',
        '--ui-button-hover-shadow': '0 12px 24px rgba(31, 111, 139, 0.28)',
      },
    },
    {
      id: 'stackedVertical',
      containerClassName: 'networks-layout--stacked-vertical',
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
        {
          panelId: 'controls',
          order: 2,
          childrenLayout: {
            mode: 'grid',
            rows: 'auto auto',
            gap: 'var(--base-space-5)',
          },
        },
        { panelId: 'flow', order: 1 },
        { panelId: 'spaces', order: 2 },
        {
          panelId: 'bottom',
          order: 2,
          childrenLayout: {
            mode: 'grid',
            columns: '100%',
          },
        },
        { panelId: 'matrix', order: 1 },
      ],
      tokens: {
        '--ui-button-bg': '#1f6f8b',
        '--ui-button-fg': '#f3fbff',
        '--ui-button-focus-ring': 'rgba(31, 111, 139, 0.32)',
        '--ui-button-hover-shadow': '0 12px 24px rgba(31, 111, 139, 0.28)',
      },
    },
  ],
};

export const NETWORKS_FALLBACK_VARIANTS = {
  sideBySide: {
    variantId: 'sideBySide',
    containerClassName: 'networks-layout--side-by-side',
    panelOrder: ['top', 'graph', 'controls', 'flow', 'spaces', 'bottom', 'matrix'] as const,
  },
  stackedVertical: {
    variantId: 'stackedVertical',
    containerClassName: 'networks-layout--stacked-vertical',
    panelOrder: ['top', 'graph', 'controls', 'flow', 'spaces', 'bottom', 'matrix'] as const,
  },
} satisfies Record<
  LayoutMode,
  {
    variantId: string;
    containerClassName: string;
    panelOrder: readonly NetworksPanelId[];
  }
>;

const resolvedLayoutProfile = resolveLayoutProfile({
  schema: NETWORKS_LAYOUT_SCHEMA,
  variantId: NETWORKS_LAYOUT_MODE,
  fallbackVariant: NETWORKS_FALLBACK_VARIANTS[NETWORKS_LAYOUT_MODE],
});

logLayoutWarnings('networks-layout', resolvedLayoutProfile.warnings);

export const ACTIVE_NETWORKS_LAYOUT_PROFILE = resolvedLayoutProfile;
