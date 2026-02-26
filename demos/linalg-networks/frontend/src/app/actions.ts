import type { BasisSpace } from './types';

export type NetworksAction =
  | { type: 'ADD_NODE' }
  | { type: 'REMOVE_NODE' }
  | { type: 'SET_EDGE_DRAFT_FROM'; nodeId: number }
  | { type: 'SET_EDGE_DRAFT_TO'; nodeId: number }
  | { type: 'ADD_EDGE' }
  | { type: 'REMOVE_EDGE'; edgeId: string }
  | { type: 'SET_EDGE_FLOW'; edgeId: string; value: number }
  | { type: 'SELECT_BASIS_VECTOR'; space: BasisSpace; index: number };
