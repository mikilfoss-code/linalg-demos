export type LayoutMode = 'sideBySide' | 'stackedVertical';

/**
 * Strategy object describing how a demo should arrange its panels.
 */
export type LayoutProfileStrategy<PanelId extends string> = {
  mode: LayoutMode;
  containerModeClassName: string;
  panelOrder: Readonly<Record<PanelId, number>>;
  orderOf: (panel: PanelId) => number;
};

type LayoutProfileConfig<PanelId extends string> = {
  sideBySide: readonly PanelId[];
  stackedVertical: readonly PanelId[];
  sideBySideClassName?: string;
  stackedVerticalClassName?: string;
};

export type LayoutProfileStrategies<PanelId extends string> = {
  sideBySide: LayoutProfileStrategy<PanelId>;
  stackedVertical: LayoutProfileStrategy<PanelId>;
  resolve: (mode: LayoutMode) => LayoutProfileStrategy<PanelId>;
};

/**
 * Build reusable layout profile strategies for a demo.
 *
 * @param config - Panel ordering and optional container class overrides.
 * @returns Strategy set keyed by layout mode with a `resolve` helper.
 */
export function createLayoutProfileStrategies<PanelId extends string>(
  config: LayoutProfileConfig<PanelId>
): LayoutProfileStrategies<PanelId> {
  const sideBySide = createLayoutProfileStrategy('sideBySide', config.sideBySide, {
    className: config.sideBySideClassName ?? 'layout--side-by-side',
  });
  const stackedVertical = createLayoutProfileStrategy('stackedVertical', config.stackedVertical, {
    className: config.stackedVerticalClassName ?? 'layout--stacked-vertical',
  });

  return {
    sideBySide,
    stackedVertical,
    resolve(mode: LayoutMode) {
      return mode === 'stackedVertical' ? stackedVertical : sideBySide;
    },
  };
}

/**
 * Convert a panel sequence into an indexable strategy object.
 *
 * @param mode - Layout mode the strategy represents.
 * @param panelSequence - Ordered panel identifiers for the mode.
 * @param options - Additional strategy metadata.
 * @returns Layout strategy with deterministic per-panel order values.
 */
function createLayoutProfileStrategy<PanelId extends string>(
  mode: LayoutMode,
  panelSequence: readonly PanelId[],
  options: { className: string }
): LayoutProfileStrategy<PanelId> {
  const panelOrder = buildPanelOrder(panelSequence);
  return {
    mode,
    containerModeClassName: options.className,
    panelOrder,
    orderOf(panel: PanelId) {
      const found = panelOrder[panel];
      return found ?? panelSequence.length + 1;
    },
  };
}

/**
 * Build a one-based order map for panel identifiers.
 *
 * @param panelSequence - Ordered panel identifiers.
 * @returns Object mapping each panel to its one-based order.
 */
function buildPanelOrder<PanelId extends string>(
  panelSequence: readonly PanelId[]
): Readonly<Record<PanelId, number>> {
  const order = {} as Record<PanelId, number>;
  panelSequence.forEach((panel, index) => {
    order[panel] = index + 1;
  });
  return order;
}
