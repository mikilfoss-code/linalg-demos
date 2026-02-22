import type { AppState } from './types';
import {
  edgeDraftKey,
  toHighlightTarget,
  type EditHighlightTarget,
  type EditTarget,
  type PanelId,
} from './edit-session';

const SELECTOR_EPSILON = 1e-12;

export function selectIsEditing(state: AppState): boolean {
  return state.editSession.mode === 'editing';
}

export function selectEditOwnerPanel(state: AppState): PanelId | null {
  return state.editSession.ownerPanel;
}

export function selectEditActiveTarget(state: AppState): EditTarget | null {
  return state.editSession.activeTarget;
}

export function selectCanUndo(state: AppState): boolean {
  return state.editSession.undoStack.length > 0;
}

export function selectCanRedo(state: AppState): boolean {
  return state.editSession.redoStack.length > 0;
}

export function selectCanCommit(state: AppState): boolean {
  if (!selectIsEditing(state)) {
    return false;
  }
  const drafts = state.editSession.drafts;
  return (
    Object.keys(drafts.edgeByKey).length > 0 ||
    Object.keys(drafts.nodeByIndex).length > 0 ||
    Object.keys(drafts.initialByIndex).length > 0
  );
}

export function selectDisplayedTransitionCell(
  state: AppState,
  fromIndex: number,
  toIndex: number
): number {
  const draft = state.editSession.drafts.edgeByKey[edgeDraftKey(fromIndex, toIndex)];
  if (Number.isFinite(draft)) {
    return draft;
  }
  return state.transitionMatrix[fromIndex]?.[toIndex] ?? 0;
}

export function selectDisplayedNodeValue(state: AppState, index: number): number {
  const draft = state.editSession.drafts.nodeByIndex[index];
  if (Number.isFinite(draft)) {
    return draft;
  }
  return state.currentVector[index] ?? 0;
}

export function selectDisplayedInitialValue(state: AppState, index: number): number {
  const draft = state.editSession.drafts.initialByIndex[index];
  if (Number.isFinite(draft)) {
    return draft;
  }
  const nodeDraft = state.editSession.drafts.nodeByIndex[index];
  if (Number.isFinite(nodeDraft)) {
    return nodeDraft;
  }
  return state.initialVector[index] ?? 0;
}

export function selectDisplayedTransitionMatrix(state: AppState): number[][] {
  return state.transitionMatrix.map((row, fromIndex) =>
    row.map((_value, toIndex) => selectDisplayedTransitionCell(state, fromIndex, toIndex))
  );
}

export function selectDisplayedCurrentVector(state: AppState): number[] {
  return state.currentVector.map((_value, index) => selectDisplayedNodeValue(state, index));
}

export function selectDisplayedInitialVector(state: AppState): number[] {
  return state.initialVector.map((_value, index) => selectDisplayedInitialValue(state, index));
}

export function selectEffectiveHighlightTarget(state: AppState): EditHighlightTarget | null {
  if (selectIsEditing(state) && state.editSession.activeTarget) {
    return toHighlightTarget(state.editSession.activeTarget);
  }
  return state.interaction.hoverTarget ?? state.interaction.selectedTarget ?? null;
}

export function selectGraphCenterTarget(state: AppState): EditHighlightTarget | null {
  if (!selectIsEditing(state) || !state.editSession.activeTarget) {
    return null;
  }
  return toHighlightTarget(state.editSession.activeTarget);
}

export function selectShouldIgnoreHover(state: AppState): boolean {
  return selectIsEditing(state);
}

export function selectIsPanelLocked(state: AppState, panel: PanelId): boolean {
  if (!selectIsEditing(state)) {
    return false;
  }
  const owner = state.editSession.ownerPanel;
  return owner !== null && owner !== panel;
}

export function selectIsValueEquivalent(
  left: number | undefined,
  right: number | undefined,
  epsilon = SELECTOR_EPSILON
): boolean {
  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return false;
  }
  return Math.abs((left as number) - (right as number)) <= epsilon;
}
