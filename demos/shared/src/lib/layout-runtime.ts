import { flattenLayoutPlan, type LayoutPlanNode, type LayoutRenderPlan } from './layout-plan';
import { validateLayoutSchema } from './layout-validate';
import {
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

type LayoutFallbackVariant<PanelId extends string> = {
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
