export type NetworksNode = {
  id: number;
};

export type NetworksEdge = {
  id: string;
  from: number;
  to: number;
};

export type BasisSpace = 'row' | 'column' | 'null' | 'left-null';

export type BasisGroups = {
  row: number[][];
  column: number[][];
  null: number[][];
  leftNull: number[][];
};

export type SelectedBasisVector = {
  space: BasisSpace;
  index: number;
} | null;

export type NetworksDerivedState = {
  incidenceMatrix: number[][];
  imbalanceVector: number[];
  rrefMatrix: number[][];
  rrefTransposeMatrix: number[][];
  basis: BasisGroups;
};

export type NetworksState = {
  nodes: NetworksNode[];
  edges: NetworksEdge[];
  flowVector: number[];
  nextNodeId: number;
  nextEdgeId: number;
  edgeDraftFrom: number;
  edgeDraftTo: number;
  selectedBasis: SelectedBasisVector;
  message: string | null;
  derived: NetworksDerivedState;
};
