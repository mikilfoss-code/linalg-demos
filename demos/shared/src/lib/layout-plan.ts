export type LayoutPlanNode<PanelId extends string> = {
  panelId: PanelId;
  order: number;
  inlineStyle: string;
  children: readonly LayoutPlanNode<PanelId>[];
};

export type LayoutRenderPlan<PanelId extends string> = {
  variantId: string;
  containerClassName: string;
  tokens: Readonly<Record<string, string>>;
  roots: readonly LayoutPlanNode<PanelId>[];
};

/**
 * Flatten a recursive render plan into depth-first node order.
 *
 * @param roots - Top-level plan nodes.
 * @returns Depth-first list of all nodes.
 */
export function flattenLayoutPlan<PanelId extends string>(
  roots: readonly LayoutPlanNode<PanelId>[]
): readonly LayoutPlanNode<PanelId>[] {
  const output: LayoutPlanNode<PanelId>[] = [];

  const visit = (node: LayoutPlanNode<PanelId>) => {
    output.push(node);
    node.children.forEach(visit);
  };

  roots.forEach(visit);
  return output;
}
