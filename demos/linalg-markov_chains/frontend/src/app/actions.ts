export type Action =
  | {
      type: 'SET_NODE_COUNT';
      nodeCount: number;
    }
  | {
      type: 'SET_TRANSITION_CELL';
      rowIndex: number;
      colIndex: number;
      value: number;
    }
  | {
      type: 'SET_GRAPH_EDGE_CELL';
      rowIndex: number;
      colIndex: number;
      value: number;
    }
  | {
      type: 'SET_INITIAL_CELL';
      index: number;
      value: number;
    }
  | {
      type: 'SET_CURRENT_CELL';
      index: number;
      value: number;
    }
  | {
      type: 'SET_INITIAL_UNIFORM';
    }
  | {
      type: 'SET_INITIAL_RANDOM';
    }
  | {
      type: 'SET_INITIAL_FROM_CURRENT';
    }
  | {
      type: 'SET_GRAPH_NODE_VALUE';
      index: number;
      value: number;
    }
  | {
      type: 'APPLY_CURRENT_AS_INITIAL_RESET';
    }
  | {
      type: 'NORMALIZE_INITIAL_AND_RESET';
    }
  | {
      type: 'APPLY_GENERATED_GRAPH';
      transitionMatrix: number[][];
      initialVector: number[];
      currentVector: number[];
    }
  | {
      type: 'NORMALIZE_MATRIX';
    }
  | {
      type: 'STEP';
    }
  | {
      type: 'RESET_TO_INITIAL';
    }
  | {
      type: 'CLEAR_FLOW_ANIMATION';
      animationId: number;
    };
