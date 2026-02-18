import type { LayoutPlanNode, LayoutRenderPlan } from './layout-plan';

export type LayoutNodeRenderContext<PanelId extends string> = {
  panelId: PanelId;
  node: LayoutPlanNode<PanelId>;
};

export type LayoutNodeRenderOutput =
  | HTMLElement
  | {
      element: HTMLElement;
      childContainer?: HTMLElement;
    };

export type LayoutNodeRenderer<PanelId extends string> = (
  context: LayoutNodeRenderContext<PanelId>
) => LayoutNodeRenderOutput;

export type LayoutRendererRegistry<PanelId extends string> = {
  byPanelId?: Partial<Record<PanelId, LayoutNodeRenderer<PanelId>>>;
  byKey?: Readonly<Record<string, LayoutNodeRenderer<PanelId>>>;
  rendererKeyOf?: (context: LayoutNodeRenderContext<PanelId>) => string;
};

export type RenderLayoutPlanOptions<PanelId extends string> = {
  container: HTMLElement;
  plan: LayoutRenderPlan<PanelId>;
  registry: LayoutRendererRegistry<PanelId>;
  shouldRenderPanel?: (context: LayoutNodeRenderContext<PanelId>) => boolean;
};

/**
 * Render a recursive layout plan into a container element.
 *
 * @param options - Render container, plan, renderer registry, and optional panel filter.
 * @returns Map from panel id to mounted root element for event binding.
 * @throws Error when a required renderer is missing.
 */
export function renderLayoutPlan<PanelId extends string>({
  container,
  plan,
  registry,
  shouldRenderPanel,
}: RenderLayoutPlanOptions<PanelId>): Map<PanelId, HTMLElement> {
  const mountedPanels = new Map<PanelId, HTMLElement>();
  container.replaceChildren();

  const mountNode = (node: LayoutPlanNode<PanelId>, mountPoint: HTMLElement) => {
    const context: LayoutNodeRenderContext<PanelId> = {
      panelId: node.panelId,
      node,
    };
    if (shouldRenderPanel && !shouldRenderPanel(context)) {
      return;
    }

    const renderer = resolveRenderer(context, registry);
    if (!renderer) {
      throw new Error(`Missing renderer for panel "${String(node.panelId)}".`);
    }

    const rendered = normalizeRenderOutput(renderer(context), node.panelId);
    applyInlineStyle(rendered.element, node.inlineStyle);
    rendered.element.dataset.layoutPanelId = String(node.panelId);
    mountPoint.appendChild(rendered.element);
    mountedPanels.set(node.panelId, rendered.element);

    const childMountPoint = rendered.childContainer ?? rendered.element;
    node.children.forEach((child) => {
      mountNode(child, childMountPoint);
    });
  };

  plan.roots.forEach((rootNode) => {
    mountNode(rootNode, container);
  });

  return mountedPanels;
}

/**
 * Purpose: resolveRenderer function.
 * Inputs: Parameters declared in the function signature.
 * Returns: The value produced by this function.
 * Side effects: May update local state, shared state, or the DOM when applicable.
 */
function resolveRenderer<PanelId extends string>(
  context: LayoutNodeRenderContext<PanelId>,
  registry: LayoutRendererRegistry<PanelId>
): LayoutNodeRenderer<PanelId> | null {
  const panelRenderer = registry.byPanelId?.[context.panelId];
  if (panelRenderer) {
    return panelRenderer;
  }

  if (registry.rendererKeyOf) {
    const rendererKey = registry.rendererKeyOf(context);
    const keyedRenderer = registry.byKey?.[rendererKey];
    if (keyedRenderer) {
      return keyedRenderer;
    }
  }

  const defaultKeyedRenderer = registry.byKey?.[String(context.panelId)];
  return defaultKeyedRenderer ?? null;
}

/**
 * Purpose: normalizeRenderOutput function.
 * Inputs: Parameters declared in the function signature.
 * Returns: The value produced by this function.
 * Side effects: May update local state, shared state, or the DOM when applicable.
 */
function normalizeRenderOutput<PanelId extends string>(
  output: LayoutNodeRenderOutput,
  panelId: PanelId
): { element: HTMLElement; childContainer?: HTMLElement } {
  if (output instanceof HTMLElement) {
    return { element: output };
  }
  if (!output?.element) {
    throw new Error(`Renderer for panel "${String(panelId)}" returned no root element.`);
  }
  return output;
}

/**
 * Purpose: applyInlineStyle function.
 * Inputs: Parameters declared in the function signature.
 * Returns: The value produced by this function.
 * Side effects: May update local state, shared state, or the DOM when applicable.
 */
function applyInlineStyle(element: HTMLElement, inlineStyle: string): void {
  if (!inlineStyle.trim()) return;

  const existingStyle = element.getAttribute('style')?.trim();
  if (!existingStyle) {
    element.setAttribute('style', inlineStyle);
    return;
  }

  const separator = existingStyle.endsWith(';') ? ' ' : '; ';
  element.setAttribute('style', `${existingStyle}${separator}${inlineStyle}`);
}
