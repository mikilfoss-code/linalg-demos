import type { MarkovAnalysisResponse } from '../lib/api';

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
      type: 'NORMALIZE_ROW';
      rowIndex: number;
    }
  | {
      type: 'NORMALIZE_MATRIX';
    }
  | {
      type: 'NORMALIZE_INITIAL_VECTOR';
    }
  | {
      type: 'NORMALIZE_CURRENT_VECTOR';
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
    }
  | {
      type: 'ANALYZE_REQUEST';
    }
  | {
      type: 'ANALYZE_SUCCESS';
      result: MarkovAnalysisResponse;
    }
  | {
      type: 'ANALYZE_ERROR';
      message: string;
    };
