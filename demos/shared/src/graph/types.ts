export type GraphInteractionTarget =
  | {
      kind: 'edge';
      fromIndex: number;
      toIndex: number;
    }
  | {
      kind: 'node';
      nodeIndex: number;
    }
  | {
      kind: 'incoming-node';
      nodeIndex: number;
    };

export type GraphInteractionState = {
  hovered: GraphInteractionTarget | null;
  selected: GraphInteractionTarget | null;
};

export type GraphHighlightPresentation = {
  activeTarget: GraphInteractionTarget | null;
  selectedTarget: GraphInteractionTarget | null;
  highlightedEdgeKeys: Set<string>;
  highlightedNodeIndices: Set<number>;
};

export type GraphDirectedEdge = {
  fromIndex: number;
  toIndex: number;
  weight: number;
};

export type GraphNodeRenderItem = {
  index: number;
  x: number;
  y: number;
  label: string;
  value?: number;
  annotation?: string;
};

export type GraphEdgeRenderItem = {
  fromIndex: number;
  toIndex: number;
  weight: number;
  label?: string;
};

export type GraphRenderScene = {
  width: number;
  height: number;
  nodeRadius: number;
  nodes: GraphNodeRenderItem[];
  edges: GraphEdgeRenderItem[];
  ariaLabel: string;
};
