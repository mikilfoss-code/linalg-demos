import type { GraphInteractionTarget } from './graph-interaction-presenter';

export type PanelScopeMode = 'full-extracted' | 'visible-only';

/**
 * Shared graph-driven context consumed by matrix/state panels.
 */
export type PanelRenderContext = {
  scopeMode: PanelScopeMode;
  extractedNodeIndices: number[];
  viewportVisibleNodeIndices: number[];
  activeTarget: GraphInteractionTarget | null;
  selectedTarget: GraphInteractionTarget | null;
};

