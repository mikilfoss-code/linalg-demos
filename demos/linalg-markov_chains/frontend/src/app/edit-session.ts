import type { FlowAnimationState } from '../lib/markov';

export type PanelId = 'matrix' | 'state' | 'graph';

export type EditTarget =
  | { kind: 'edge'; fromIndex: number; toIndex: number }
  | { kind: 'node'; index: number }
  | { kind: 'initial'; index: number };

export type EditMode = 'idle' | 'editing';

export type EditDrafts = {
  edgeByKey: Record<string, number>;
  nodeByIndex: Record<number, number>;
  initialByIndex: Record<number, number>;
};

export type EditSnapshot = {
  transitionMatrix: number[][];
  currentVector: number[];
  initialVector: number[];
  stepCount: number;
  flowAnimation: FlowAnimationState | null;
};

export type EditOp = {
  target: EditTarget;
  panel: PanelId | null;
  prev: number | null;
  next: number;
  ts: number;
};

export type EditSessionState = {
  mode: EditMode;
  ownerPanel: PanelId | null;
  activeTarget: EditTarget | null;
  snapshot: EditSnapshot | null;
  drafts: EditDrafts;
  undoStack: EditOp[];
  redoStack: EditOp[];
};

export type EditHighlightTarget =
  | { kind: 'edge'; fromIndex: number; toIndex: number }
  | { kind: 'node'; nodeIndex: number }
  | { kind: 'incoming-node'; nodeIndex: number };

export const EDGE_DRAFT_KEY_PREFIX = 'edge';

export function edgeDraftKey(fromIndex: number, toIndex: number): string {
  return `${EDGE_DRAFT_KEY_PREFIX}-${fromIndex}-${toIndex}`;
}

export function parseEdgeDraftKey(
  key: string
): {
  fromIndex: number;
  toIndex: number;
} | null {
  const match = /^edge-(\d+)-(\d+)$/.exec(key);
  if (!match) {
    return null;
  }
  const fromIndex = Number.parseInt(match[1], 10);
  const toIndex = Number.parseInt(match[2], 10);
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) {
    return null;
  }
  return {
    fromIndex,
    toIndex,
  };
}

export function createEmptyEditDrafts(): EditDrafts {
  return {
    edgeByKey: {},
    nodeByIndex: {},
    initialByIndex: {},
  };
}

export function createIdleEditSessionState(): EditSessionState {
  return {
    mode: 'idle',
    ownerPanel: null,
    activeTarget: null,
    snapshot: null,
    drafts: createEmptyEditDrafts(),
    undoStack: [],
    redoStack: [],
  };
}

export function toHighlightTarget(target: EditTarget): EditHighlightTarget {
  if (target.kind === 'edge') {
    return {
      kind: 'edge',
      fromIndex: target.fromIndex,
      toIndex: target.toIndex,
    };
  }
  return {
    kind: 'node',
    nodeIndex: target.index,
  };
}
