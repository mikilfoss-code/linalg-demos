import type { EditHighlightTarget, EditTarget, PanelId } from './edit-session';

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
      type: 'APPLY_TRANSITION_DRAFTS_AND_NORMALIZE';
      edits: Array<{
        rowIndex: number;
        colIndex: number;
        value: number;
      }>;
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
      type: 'APPLY_INITIAL_DRAFTS_AND_RESET';
      edits: Array<{
        index: number;
        value: number;
      }>;
    }
  | {
      type: 'SET_CURRENT_CELL';
      index: number;
      value: number;
    }
  | {
      type: 'APPLY_CURRENT_DRAFTS_AND_RESET';
      edits: Array<{
        index: number;
        value: number;
      }>;
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
    }
  | {
      type: 'EDIT_BEGIN';
      panel: PanelId;
      target: EditTarget;
    }
  | {
      type: 'EDIT_FOCUS_TARGET';
      panel: PanelId;
      target: EditTarget;
    }
  | {
      type: 'EDIT_CHANGE_VALUE';
      target: EditTarget;
      value: number;
    }
  | {
      type: 'EDIT_TAB_NAVIGATE';
      panel: PanelId;
      reverse: boolean;
    }
  | {
      type: 'EDIT_COMMIT';
      reason: 'enter' | 'normalize_button';
    }
  | {
      type: 'EDIT_CANCEL';
      reason: 'escape' | 'outside_click';
    }
  | {
      type: 'EDIT_UNDO';
    }
  | {
      type: 'EDIT_REDO';
    }
  | {
      type: 'INTERACTION_HOVER_SET';
      target: EditHighlightTarget | null;
    }
  | {
      type: 'INTERACTION_SELECT_SET';
      target: EditHighlightTarget | null;
    };
