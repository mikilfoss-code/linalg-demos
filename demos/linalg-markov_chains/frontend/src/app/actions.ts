import type { EditHighlightTarget, EditTarget, PanelId } from './edit-session';
import type { FlowAnimationState } from '../lib/markov';
import type {
  MarkovDatasetId,
  MarkovDatasetInfo,
  MarkovDatasetLayoutId,
  MarkovDatasetPresetId,
  MarkovDatasetPresetInfo,
  MarkovSourceMode,
  StepComputeBackend,
} from './types';

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
      type: 'SET_SOURCE_MODE';
      mode: MarkovSourceMode;
    }
  | {
      type: 'DATASET_SET_SELECTED_DATASET';
      datasetId: MarkovDatasetId;
    }
  | {
      type: 'DATASET_SET_SELECTED_PRESET';
      presetId: MarkovDatasetPresetId;
    }
  | {
      type: 'DATASET_SET_SELECTED_LAYOUT';
      layoutId: MarkovDatasetLayoutId;
    }
  | {
      type: 'DATASET_SET_TARGET_NODE_COUNT';
      nodeCount: number;
    }
  | {
      type: 'DATASET_SET_SEED';
      seed: number | null;
    }
  | {
      type: 'DATASET_CATALOG_REQUEST';
    }
  | {
      type: 'DATASET_CATALOG_SUCCESS';
      datasets: MarkovDatasetInfo[];
      presets: MarkovDatasetPresetInfo[];
    }
  | {
      type: 'DATASET_CATALOG_FAILURE';
      error: string;
    }
  | {
      type: 'DATASET_EXTRACT_REQUEST';
    }
  | {
      type: 'DATASET_EXTRACT_SUCCESS';
      datasetId: MarkovDatasetId;
      transitionMatrix: number[][];
      initialVector: number[];
      currentVector: number[];
      nodeLabels: string[];
      selectedNodeCount: number;
      selectedEdgeCount: number;
      danglingNodeCount: number;
    }
  | {
      type: 'DATASET_EXTRACT_FAILURE';
      error: string;
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
      type: 'STEP_REQUEST';
      requestId: number;
      matrixId: number;
      expectedNextAnimationId: number;
    }
  | {
      type: 'STEP_SUCCESS';
      requestId: number;
      matrixId: number;
      expectedNextAnimationId: number;
      transitionMatrix: number[][];
      toVector: number[];
      flowAnimation: FlowAnimationState;
      durationMs: number;
      backend: StepComputeBackend;
    }
  | {
      type: 'STEP_FAILURE';
      requestId: number;
      message: string;
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
