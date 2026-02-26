import { flattenLayoutPlan, type LayoutPlanNode, type LayoutRenderPlan } from './layout-plan';
import {
  renderLayoutPlan,
  type LayoutNodeRenderContext,
  type LayoutRendererRegistry,
} from './layout-renderer';
import { validateLayoutSchema } from './layout-validate';
import {
  type LayoutChildrenLayout,
  type LayoutPanelDef,
  type LayoutPlacement,
  type LayoutSchema,
} from './layout-schema';

export type LayoutPanelPlacementRuntime<PanelId extends string> = LayoutPlacement<PanelId> & {
  order: number;
};

export type ResolvedLayoutProfile<PanelId extends string> = {
  variantId: string;
  containerModeClassName: string;
  tokens: Readonly<Record<string, string>>;
  warnings: readonly string[];
  isFallback: boolean;
  renderPlan: LayoutRenderPlan<PanelId>;
  placementOf: (panel: PanelId) => LayoutPanelPlacementRuntime<PanelId> | null;
  nodeOf: (panel: PanelId) => LayoutPlanNode<PanelId> | null;
};

export type LayoutFallbackVariant<PanelId extends string> = {
  variantId: string;
  containerClassName: string;
  panelOrder: readonly PanelId[];
  tokens?: Readonly<Record<string, string | number>>;
};

type ResolveLayoutProfileOptions<PanelId extends string> = {
  schema: LayoutSchema<PanelId>;
  variantId: string;
  fallbackVariant: LayoutFallbackVariant<PanelId>;
};

export type ResolveResponsiveVariantIdOptions<PanelId extends string> = {
  schema: LayoutSchema<PanelId>;
  preferredVariantId: string;
  currentVariantId: string;
  containerWidthPx: number;
  panelWidthsPx: ReadonlyMap<PanelId, number>;
};

export type MountResponsiveLayoutOptions<PanelId extends string> = {
  container: HTMLElement;
  tokenTarget?: HTMLElement;
  schema: LayoutSchema<PanelId>;
  preferredVariantId: string;
  fallbackVariant: LayoutFallbackVariant<PanelId>;
  registry: LayoutRendererRegistry<PanelId>;
  shouldRenderPanel?: (context: LayoutNodeRenderContext<PanelId>) => boolean;
};

export type ResponsiveLayoutMountHandle<PanelId extends string> = {
  getProfile: () => ResolvedLayoutProfile<PanelId>;
  getMountedPanels: () => ReadonlyMap<PanelId, HTMLElement>;
  rerender: () => void;
  destroy: () => void;
};

/**
 * Resolve a runtime profile from schema with validation and safe fallback.
 *
 * @param options - Schema, requested variant, and fallback variant.
 * @returns Resolved runtime profile used by demo view code.
 */
export function resolveLayoutProfile<PanelId extends string>({
  schema,
  variantId,
  fallbackVariant,
}: ResolveLayoutProfileOptions<PanelId>): ResolvedLayoutProfile<PanelId> {
  const validation = validateLayoutSchema(schema);
  const warnings: string[] = [];

  if (!validation.valid) {
    warnings.push(...validation.issues.map((issue) => `${issue.path}: ${issue.message}`));
    return {
      ...createFallbackProfile(fallbackVariant),
      warnings,
      isFallback: true,
    };
  }

  const requestedVariant =
    schema.variants.find((variant) => String(variant.id) === variantId) ??
    schema.variants.find((variant) => String(variant.id) === schema.defaultVariantId);

  if (!requestedVariant) {
    warnings.push(
      `Requested variant "${variantId}" and default variant "${schema.defaultVariantId}" were not found.`
    );
    return {
      ...createFallbackProfile(fallbackVariant),
      warnings,
      isFallback: true,
    };
  }

  const placementsByPanel = buildPlacementsByPanel(requestedVariant.placements);
  const tokens = normalizeTokenValues(requestedVariant.tokens);
  const roots = buildPlanRoots(schema.panels, placementsByPanel);
  const renderPlan: LayoutRenderPlan<PanelId> = {
    variantId: String(requestedVariant.id),
    containerClassName: requestedVariant.containerClassName,
    tokens,
    roots,
  };
  const nodeByPanel = buildNodeMap(roots);

  return {
    variantId: String(requestedVariant.id),
    containerModeClassName: requestedVariant.containerClassName,
    tokens,
    warnings,
    isFallback: false,
    renderPlan,
    placementOf(panel: PanelId): LayoutPanelPlacementRuntime<PanelId> | null {
      return placementsByPanel.get(panel) ?? null;
    },
    nodeOf(panel: PanelId): LayoutPlanNode<PanelId> | null {
      return nodeByPanel.get(panel) ?? null;
    },
  };
}

/**
 * Pick an active variant id based on responsive fallback rules in the preferred variant.
 */
export function resolveResponsiveVariantId<PanelId extends string>(
  options: ResolveResponsiveVariantIdOptions<PanelId>
): string {
  const preferredVariant =
    options.schema.variants.find((variant) => String(variant.id) === options.preferredVariantId) ??
    options.schema.variants.find((variant) => String(variant.id) === options.schema.defaultVariantId);
  if (!preferredVariant) {
    return options.currentVariantId;
  }

  const fallbackRules = preferredVariant.responsiveFallbacks ?? [];
  const activePreferredVariantId = String(preferredVariant.id);
  for (const rule of fallbackRules) {
    const measurement = readResponsiveMeasurement(rule, options.containerWidthPx, options.panelWidthsPx);
    if (!Number.isFinite(measurement)) {
      continue;
    }

    const enterThreshold = readResponsiveThreshold(rule);
    if (!Number.isFinite(enterThreshold)) {
      continue;
    }
    const hysteresis = Math.max(0, rule.hysteresisPx ?? 0);
    const fallbackVariantId = rule.fallbackVariantId;

    if (options.currentVariantId === fallbackVariantId) {
      if (measurement <= enterThreshold + hysteresis) {
        return fallbackVariantId;
      }
      continue;
    }

    if (measurement <= enterThreshold) {
      return fallbackVariantId;
    }
  }

  return activePreferredVariantId;
}

/**
 * Render a layout plan and keep it responsive using schema fallback rules.
 */
export function mountResponsiveLayout<PanelId extends string>(
  options: MountResponsiveLayoutOptions<PanelId>
): ResponsiveLayoutMountHandle<PanelId> {
  const variantClassNames = options.schema.variants.map((variant) => variant.containerClassName);
  let mountedPanels = new Map<PanelId, HTMLElement>();
  let currentVariantId = options.preferredVariantId;
  let currentProfile = resolveLayoutProfile({
    schema: options.schema,
    variantId: currentVariantId,
    fallbackVariant: options.fallbackVariant,
  });
  let frameHandle: number | null = null;
  let destroyed = false;

  const renderActiveVariant = (variantId: string) => {
    currentProfile = resolveLayoutProfile({
      schema: options.schema,
      variantId,
      fallbackVariant: options.fallbackVariant,
    });
    currentVariantId = currentProfile.variantId;
    applyContainerVariantClass(options.container, variantClassNames, currentProfile.containerModeClassName);
    if (options.tokenTarget) {
      applyLayoutTokens(options.tokenTarget, currentProfile.tokens);
    }
    mountedPanels = renderLayoutPlan({
      container: options.container,
      plan: currentProfile.renderPlan,
      registry: options.registry,
      shouldRenderPanel: options.shouldRenderPanel,
    });
  };

  const evaluateResponsiveVariant = () => {
    const panelWidths = new Map<PanelId, number>();
    mountedPanels.forEach((panelElement, panelId) => {
      panelWidths.set(panelId, panelElement.getBoundingClientRect().width);
    });
    const containerWidth = options.container.getBoundingClientRect().width;
    return resolveResponsiveVariantId({
      schema: options.schema,
      preferredVariantId: options.preferredVariantId,
      currentVariantId,
      containerWidthPx: containerWidth,
      panelWidthsPx: panelWidths,
    });
  };

  const scheduleResponsiveCheck = () => {
    if (destroyed || frameHandle !== null) {
      return;
    }
    frameHandle = window.requestAnimationFrame(() => {
      frameHandle = null;
      if (destroyed) {
        return;
      }
      const nextVariantId = evaluateResponsiveVariant();
      if (nextVariantId !== currentVariantId) {
        renderActiveVariant(nextVariantId);
      }
    });
  };

  renderActiveVariant(currentVariantId);
  const initialResponsiveVariant = evaluateResponsiveVariant();
  if (initialResponsiveVariant !== currentVariantId) {
    renderActiveVariant(initialResponsiveVariant);
  }

  const resizeObserver = new ResizeObserver(() => {
    scheduleResponsiveCheck();
  });
  resizeObserver.observe(options.container);

  return {
    getProfile() {
      return currentProfile;
    },
    getMountedPanels() {
      return mountedPanels;
    },
    rerender() {
      renderActiveVariant(currentVariantId);
      scheduleResponsiveCheck();
    },
    destroy() {
      destroyed = true;
      if (frameHandle !== null) {
        window.cancelAnimationFrame(frameHandle);
        frameHandle = null;
      }
      resizeObserver.disconnect();
    },
  };
}

/**
 * Apply layout-level CSS variable overrides on an element.
 *
 * @param root - Element that should receive the CSS variables.
 * @param tokens - CSS variable map (keys should include `--` prefix).
 * @returns Nothing.
 */
export function applyLayoutTokens(
  root: HTMLElement,
  tokens: Readonly<Record<string, string>>
): void {
  Object.entries(tokens).forEach(([name, value]) => {
    root.style.setProperty(name, value);
  });
}

/**
 * Build inline style string from a panel placement definition.
 *
 * @param placement - Resolved panel placement.
 * @returns Inline style string safe for HTML template interpolation.
 */
export function placementToInlineStyle<PanelId extends string>(
  placement: LayoutPanelPlacementRuntime<PanelId> | null
): string {
  if (!placement) return '';

  const declarations: string[] = [];
  declarations.push(`order: ${placement.order}`);
  if (placement.width) declarations.push(`width: ${placement.width}`);
  if (placement.height) declarations.push(`height: ${placement.height}`);
  if (placement.minWidth) declarations.push(`min-width: ${placement.minWidth}`);
  if (placement.minHeight) declarations.push(`min-height: ${placement.minHeight}`);
  if (placement.maxWidth) declarations.push(`max-width: ${placement.maxWidth}`);
  if (placement.maxHeight) declarations.push(`max-height: ${placement.maxHeight}`);
  if (placement.padding) declarations.push(`padding: ${placement.padding}`);

  return declarations.join('; ');
}

/**
 * Build inline style string for a panel child container layout definition.
 */
export function childrenLayoutToInlineStyle(layout: LayoutChildrenLayout | undefined): string {
  if (!layout) {
    return '';
  }

  const declarations: string[] = [];
  declarations.push(`display: ${layout.mode}`);
  if (layout.mode === 'grid') {
    if (layout.columns) {
      declarations.push(`grid-template-columns: ${layout.columns}`);
    }
    if (layout.rows) {
      declarations.push(`grid-template-rows: ${layout.rows}`);
    }
  }
  if (layout.mode === 'flex') {
    declarations.push(`flex-direction: ${layout.direction ?? 'row'}`);
  }
  if (layout.gap) {
    declarations.push(`gap: ${layout.gap}`);
  }
  if (layout.alignItems) {
    declarations.push(`align-items: ${layout.alignItems}`);
  }
  if (layout.justifyItems) {
    declarations.push(`justify-items: ${layout.justifyItems}`);
  }
  if (layout.justifyContent) {
    declarations.push(`justify-content: ${layout.justifyContent}`);
  }

  // Parent safety guardrails.
  declarations.push('min-width: 0');
  declarations.push('min-height: 0');
  declarations.push('max-width: 100%');
  declarations.push('max-height: 100%');
  declarations.push('box-sizing: border-box');

  return declarations.join('; ');
}

/**
 * Log layout warnings with a stable prefix.
 *
 * @param context - Logical warning scope (e.g. demo id).
 * @param warnings - Warning messages to print.
 * @returns Nothing.
 */
export function logLayoutWarnings(context: string, warnings: readonly string[]): void {
  if (!warnings.length) return;
  warnings.forEach((warning) => {
    console.warn(`[${context}] ${warning}`);
  });
}

function createFallbackProfile<PanelId extends string>(
  fallbackVariant: LayoutFallbackVariant<PanelId>
): Omit<ResolvedLayoutProfile<PanelId>, 'warnings' | 'isFallback'> {
  const placementsByPanel = new Map<PanelId, LayoutPanelPlacementRuntime<PanelId>>();
  const roots: LayoutPlanNode<PanelId>[] = fallbackVariant.panelOrder.map((panelId, index) => {
    const placement: LayoutPanelPlacementRuntime<PanelId> = {
      panelId,
      order: index + 1,
    };
    placementsByPanel.set(panelId, placement);
    return {
      panelId,
      order: placement.order,
      inlineStyle: placementToInlineStyle(placement),
      children: [],
    };
  });

  const renderPlan: LayoutRenderPlan<PanelId> = {
    variantId: fallbackVariant.variantId,
    containerClassName: fallbackVariant.containerClassName,
    tokens: normalizeTokenValues(fallbackVariant.tokens),
    roots,
  };
  const nodeByPanel = buildNodeMap(roots);

  return {
    variantId: fallbackVariant.variantId,
    containerModeClassName: fallbackVariant.containerClassName,
    tokens: renderPlan.tokens,
    renderPlan,
    placementOf(panel: PanelId): LayoutPanelPlacementRuntime<PanelId> | null {
      return placementsByPanel.get(panel) ?? null;
    },
    nodeOf(panel: PanelId): LayoutPlanNode<PanelId> | null {
      return nodeByPanel.get(panel) ?? null;
    },
  };
}

function buildPlacementsByPanel<PanelId extends string>(
  placements: readonly LayoutPlacement<PanelId>[]
): Map<PanelId, LayoutPanelPlacementRuntime<PanelId>> {
  const byPanel = new Map<PanelId, LayoutPanelPlacementRuntime<PanelId>>();
  placements.forEach((placement, index) => {
    byPanel.set(placement.panelId, {
      ...placement,
      order: placement.order ?? index + 1,
    });
  });
  return byPanel;
}

function buildPlanRoots<PanelId extends string>(
  panels: readonly LayoutPanelDef<PanelId>[],
  placementsByPanel: ReadonlyMap<PanelId, LayoutPanelPlacementRuntime<PanelId>>
): readonly LayoutPlanNode<PanelId>[] {
  type MutablePlanNode = {
    panelId: PanelId;
    order: number;
    inlineStyle: string;
    childInlineStyle?: string;
    children: MutablePlanNode[];
  };

  const panelIndexById = new Map<PanelId, number>();
  panels.forEach((panel, index) => {
    panelIndexById.set(panel.id, index);
  });

  const nodeByPanel = new Map<PanelId, MutablePlanNode>();
  panels.forEach((panel, index) => {
    const fallbackPlacement: LayoutPanelPlacementRuntime<PanelId> = {
      panelId: panel.id,
      order: index + 1,
    };
    const placement = placementsByPanel.get(panel.id) ?? fallbackPlacement;
    nodeByPanel.set(panel.id, {
      panelId: panel.id,
      order: placement.order,
      inlineStyle: placementToInlineStyle(placement),
      childInlineStyle: childrenLayoutToInlineStyle(placement.childrenLayout),
      children: [],
    });
  });

  const rootNodes: MutablePlanNode[] = [];
  panels.forEach((panel) => {
    const node = nodeByPanel.get(panel.id);
    if (!node) return;

    if (!panel.parentId) {
      rootNodes.push(node);
      return;
    }

    const parentNode = nodeByPanel.get(panel.parentId);
    if (!parentNode) {
      rootNodes.push(node);
      return;
    }
    parentNode.children.push(node);
  });

  const sortNodes = (nodes: MutablePlanNode[]) => {
    nodes.sort((left, right) => {
      if (left.order !== right.order) {
        return left.order - right.order;
      }
      const leftIndex = panelIndexById.get(left.panelId) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = panelIndexById.get(right.panelId) ?? Number.MAX_SAFE_INTEGER;
      return leftIndex - rightIndex;
    });
    nodes.forEach((child) => {
      sortNodes(child.children);
    });
  };

  sortNodes(rootNodes);

  const toReadOnlyNode = (node: MutablePlanNode): LayoutPlanNode<PanelId> => {
    return {
      panelId: node.panelId,
      order: node.order,
      inlineStyle: node.inlineStyle,
      childInlineStyle: node.childInlineStyle,
      children: node.children.map(toReadOnlyNode),
    };
  };

  return rootNodes.map(toReadOnlyNode);
}

function buildNodeMap<PanelId extends string>(
  roots: readonly LayoutPlanNode<PanelId>[]
): Map<PanelId, LayoutPlanNode<PanelId>> {
  const nodeByPanel = new Map<PanelId, LayoutPlanNode<PanelId>>();
  flattenLayoutPlan(roots).forEach((node) => {
    nodeByPanel.set(node.panelId, node);
  });
  return nodeByPanel;
}

function normalizeTokenValues(
  tokens: Readonly<Record<string, string | number>> | undefined
): Readonly<Record<string, string>> {
  if (!tokens) return {};
  const normalized: Record<string, string> = {};
  Object.entries(tokens).forEach(([name, value]) => {
    normalized[name] = String(value);
  });
  return normalized;
}

function applyContainerVariantClass(
  container: HTMLElement,
  variantClassNames: readonly string[],
  activeClassName: string
) {
  variantClassNames.forEach((className) => {
    if (className !== activeClassName) {
      container.classList.remove(className);
    }
  });
  container.classList.add(activeClassName);
}

function readResponsiveMeasurement<PanelId extends string>(
  rule: {
    panelId?: PanelId;
  },
  containerWidthPx: number,
  panelWidthsPx: ReadonlyMap<PanelId, number>
): number {
  if (!rule.panelId) {
    return containerWidthPx;
  }
  return panelWidthsPx.get(rule.panelId) ?? Number.NaN;
}

function readResponsiveThreshold(rule: {
  maxContainerWidthPx?: number;
  maxPanelWidthPx?: number;
}): number {
  if (typeof rule.maxPanelWidthPx === 'number') {
    return rule.maxPanelWidthPx;
  }
  if (typeof rule.maxContainerWidthPx === 'number') {
    return rule.maxContainerWidthPx;
  }
  return Number.NaN;
}
