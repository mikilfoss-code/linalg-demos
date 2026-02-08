import './style.css';
import { initializeVectorsApp } from './app/bootstrap';
import { renderDatasetOptions } from './app/dataset-select';
import { DEFAULT_DATASET, DEFAULT_IMAGE_HEIGHT, DEFAULT_IMAGE_WIDTH } from './app/constants';
import { attachAppEventHandlers } from './app/events';
import { clampGridLayout, computeGridLayout, computeRowCount } from './app/layout';
import {
  getFallbackGridLayout,
  getGridGaps,
  getGridMaxSamples,
  getGridTargetHeight,
  getGridTileMax,
  getGridTileMin,
  getTextGridColumns,
  getTextTileHeight,
} from './app/layout-config';
import { renderGrid, updateGridSelection } from './app/render-grid';
import { createSelectedRenderer } from './app/render-selected';
import { createVectorRenderer } from './app/render-vector';
import { createSamplingController } from './app/sampling';
import {
  getActiveModality,
  getDatasetLabel,
  getSelectedSample,
  reducer,
  type Action,
  type AppState,
  type GridLayout,
} from './app/state';
import { createTextHighlightingController } from './app/text-highlighting';
import { createAppView } from './app/view';
import { DATASET_SAMPLES_ENDPOINT, type DatasetSample } from './lib/dataset';
import { type DatasetModality } from './lib/types';

const appView = createAppView();
const {
  statusPill,
  gridTitle,
  gridSubtitle,
  selectedStatus,
  gridEl,
  vectorPanel,
  vectorTitle,
  vectorSubtitleLeading,
  datasetSelect,
  datasetNameEl,
  resampleBtn,
  sampleCountEl,
  selectedCard,
  selectedCanvas,
  selectedText,
  selectedTextContent,
  selectedBuffer,
  selectedBufferCtx,
  vectorLengthEl,
  vectorRangeEl,
  vectorSlider,
  vectorList,
  debug,
} = appView;

const FALLBACK_GRID_LAYOUT = getFallbackGridLayout();

// Initialize CSS grid columns with a reasonable fallback until we can measure.
gridEl.style.setProperty('--grid-columns', String(FALLBACK_GRID_LAYOUT.columns));
gridEl.style.setProperty('--grid-rows', String(FALLBACK_GRID_LAYOUT.rows));

/**
 * Read vector outline color from CSS tokens.
 *
 * @returns Outline color value used for selected-image vector overlays.
 */
function getOutlineColor() {
  return (
    getComputedStyle(document.documentElement).getPropertyValue('--vector-outline').trim() ||
    '#f06449'
  );
}

let state: AppState = {
  status: 'loading',
  dataset: DEFAULT_DATASET,
  datasetOptions: [],
  meta: null,
  samples: [],
  selectedId: null,
  vectorOffset: 0,
  gridLayout: FALLBACK_GRID_LAYOUT,
  targetSampleCount: FALLBACK_GRID_LAYOUT.columns * FALLBACK_GRID_LAYOUT.rows,
};

let lastSamples: DatasetSample[] | null = null;
let lastModality: DatasetModality | null = null;
let imageHoverPixelIndex: number | null = null;
let imagePinnedPixelIndex: number | null = null;

/**
 * Resolve active image pixel highlight, preferring hover over pinned state.
 *
 * @returns Active pixel index, or `null` when no highlight is active.
 */
function getActiveImagePixelIndex(): number | null {
  return imageHoverPixelIndex ?? imagePinnedPixelIndex;
}

/**
 * Update hover-driven image pixel highlight and trigger rerender.
 *
 * @param index - Hovered pixel index, or `null` to clear.
 * @returns Nothing.
 */
function setImageHoverPixelIndex(index: number | null) {
  if (imageHoverPixelIndex === index) return;
  imageHoverPixelIndex = index;
  render(state);
}

/**
 * Update click-pinned image pixel highlight and trigger rerender.
 *
 * @param index - Pinned pixel index, or `null` to clear.
 * @returns Nothing.
 */
function setImagePinnedPixelIndex(index: number | null) {
  if (imagePinnedPixelIndex === index) return;
  imagePinnedPixelIndex = index;
  render(state);
}

/**
 * Dispatch an action through reducer and rerender the app.
 *
 * @param action - State transition action.
 * @returns Nothing.
 */
function dispatch(action: Action) {
  if (
    action.type === 'catalog-success' ||
    action.type === 'load-success' ||
    action.type === 'dataset-change' ||
    action.type === 'samples-success' ||
    action.type === 'samples-append' ||
    action.type === 'samples-trim' ||
    action.type === 'select'
  ) {
    imageHoverPixelIndex = null;
    imagePinnedPixelIndex = null;
  }
  state = reducer(state, action);
  render(state);
}

const sampling = createSamplingController({
  getState: () => state,
  dispatch,
});

/**
 * Ensure current sample list matches target count by appending as needed.
 *
 * @param targetCount - Desired sample count.
 * @returns Promise that resolves when reconciliation completes.
 */
async function syncSamplesToTarget(targetCount: number) {
  await sampling.syncSamplesToTarget(targetCount);
}

/**
 * Replace current sample list with a fresh request.
 *
 * @param count - Number of samples to request.
 * @returns Promise that resolves when replacement completes.
 */
async function replaceSamples(count: number) {
  await sampling.replaceSamples(count);
}

/**
 * Apply and persist grid layout changes, then reconcile sample count.
 *
 * @param nextLayout - Requested grid columns/rows.
 * @param options - Controls whether sample reconciliation should run.
 * @returns Nothing.
 */
function updateGridLayout(nextLayout: GridLayout, options: { syncSamples?: boolean } = {}) {
  const { syncSamples = true } = options;
  const normalized = clampGridLayout(nextLayout, getGridMaxSamples());
  const nextCount = normalized.columns * normalized.rows;

  if (
    normalized.columns === state.gridLayout.columns &&
    normalized.rows === state.gridLayout.rows &&
    nextCount === state.targetSampleCount
  ) {
    if (syncSamples) {
      void syncSamplesToTarget(state.targetSampleCount);
    }
    return;
  }

  gridEl.style.setProperty('--grid-columns', String(normalized.columns));
  gridEl.style.setProperty('--grid-rows', String(normalized.rows));
  dispatch({ type: 'layout-change', layout: normalized, targetSampleCount: nextCount });

  if (syncSamples) {
    void syncSamplesToTarget(nextCount);
  }
}

/**
 * Update CSS row-size variable used by the sample grid.
 *
 * @param rowSize - Row size in CSS pixels.
 * @returns Nothing.
 */
function setGridRowSize(rowSize: number) {
  if (!Number.isFinite(rowSize) || rowSize <= 0) return;
  // Keep a stable row height so sample count stays tied to measured grid space.
  gridEl.style.setProperty('--grid-row-size', `${rowSize}px`);
}

/**
 * Compute and apply responsive layout using measured grid dimensions.
 *
 * @param width - Available grid width in CSS pixels.
 * @param height - Available grid height in CSS pixels.
 * @param options - Controls whether sample reconciliation should run.
 * @returns Nothing.
 */
function updateLayoutFromGridSize(
  width: number,
  height: number,
  options: { syncSamples?: boolean } = {}
) {
  if (width <= 0 || height <= 0) return;
  const measuredHeight = gridEl.getBoundingClientRect().height;
  const effectiveHeight =
    Number.isFinite(measuredHeight) && measuredHeight > 0 ? Math.min(height, measuredHeight) : height;
  if (effectiveHeight <= 0) return;
  const { columnGap, rowGap } = getGridGaps(gridEl);
  if (getActiveModality(state) === 'text') {
    const columns = getTextGridColumns();
    const rowSize = getTextTileHeight();
    const rows = computeRowCount(effectiveHeight, rowSize, rowGap);
    const layout = clampGridLayout({ columns, rows }, getGridMaxSamples());
    setGridRowSize(rowSize);
    updateGridLayout(layout, options);
    return;
  }
  const imageWidth = state.meta?.imageWidth ?? DEFAULT_IMAGE_WIDTH;
  const imageHeight = state.meta?.imageHeight ?? DEFAULT_IMAGE_HEIGHT;
  const tileMin = getGridTileMin();
  const { layout, rowSize } = computeGridLayout({
    width,
    height: effectiveHeight,
    columnGap,
    rowGap,
    imageWidth,
    imageHeight,
    tileMin,
    tileMax: getGridTileMax(tileMin),
    maxSamples: getGridMaxSamples(),
  });
  setGridRowSize(rowSize);
  updateGridLayout(layout, options);
}

const textHighlighting = createTextHighlightingController({
  vectorList,
  vectorPanel,
  selectedTextContent,
});

const selectedRenderer = createSelectedRenderer({
  selectedStatus,
  selectedCard,
  selectedCanvas,
  selectedText,
  selectedTextContent,
  selectedBuffer,
  selectedBufferCtx,
  getOutlineColor,
  renderSelectedTextContent: textHighlighting.renderSelectedTextContent,
});

const vectorRenderer = createVectorRenderer({
  vectorRangeEl,
  vectorSlider,
  vectorList,
  getActiveHighlightedWord: textHighlighting.getActiveHighlightedWord,
  getActiveImagePixelIndex,
  getWordWeight: textHighlighting.getWordWeight,
  setVectorHighlight: textHighlighting.setVectorHighlight,
});

/**
 * Render diagnostics panel values from current app state.
 *
 * @param current - Current app state snapshot.
 * @returns Nothing.
 */
function renderDebug(current: AppState) {
  if (!debug) return;

  debug.debugStatus.textContent = current.status;
  debug.debugEndpoint.textContent = DATASET_SAMPLES_ENDPOINT;
  debug.debugSource.textContent = current.meta?.source ?? '--';
  debug.debugSplit.textContent = current.meta?.split ?? '--';
  debug.debugSize.textContent = current.meta
    ? current.meta.modality === 'text'
      ? String(current.meta.vectorLength)
      : `${current.meta.imageWidth}x${current.meta.imageHeight}`
    : '--';
  debug.debugTotal.textContent = current.meta ? String(current.meta.totalCount) : '--';
  debug.debugSamples.textContent = String(current.samples.length);
  debug.debugSelected.textContent = current.selectedId !== null ? String(current.selectedId) : '--';
  debug.debugOffset.textContent = String(current.vectorOffset);
  debug.debugError.textContent = current.error ?? '--';
}

/**
 * Top-level render pass for all vectors app UI regions.
 *
 * @param current - Current app state snapshot.
 * @returns Nothing. Mutates DOM to reflect state.
 */
function render(current: AppState) {
  const requestedDatasetLabel = getDatasetLabel(current.dataset, current.datasetOptions);
  const activeDatasetLabel = current.meta?.displayName ?? requestedDatasetLabel;
  const modality = getActiveModality(current);
  const textMode = modality === 'text';
  if (modality !== lastModality) {
    lastModality = modality;
    const { width } = gridEl.getBoundingClientRect();
    updateLayoutFromGridSize(width, getGridTargetHeight(), {
      syncSamples: current.meta !== null,
    });
  }

  renderDatasetOptions(datasetSelect, current.datasetOptions, current.dataset);
  datasetNameEl.textContent = activeDatasetLabel;
  sampleCountEl.textContent = String(current.targetSampleCount);
  resampleBtn.disabled = !current.meta || current.status === 'loading';
  datasetSelect.disabled = current.status === 'loading' || current.datasetOptions.length === 0;

  gridEl.classList.toggle('is-text-grid', textMode);
  vectorPanel.classList.toggle('is-text-mode', textMode);
  gridTitle.textContent = textMode ? 'Document table' : 'Image table';
  gridSubtitle.textContent = textMode ? 'Select a document' : 'Select an image';
  vectorTitle.textContent = textMode ? 'Vector components window' : 'Vector window';
  vectorSubtitleLeading.textContent = '10 components at a time';
  gridEl.setAttribute('aria-label', textMode ? 'Document grid' : 'Sample grid');
  if (debug) {
    debug.debugSizeLabel.textContent = textMode ? 'Vocab size' : 'Image size';
  }
  textHighlighting.updateVectorTextWordWidth(current.meta);
  if (!textMode) {
    textHighlighting.resetTextModeState();
    selectedRenderer.resetTextSignature();
  }

  if (current.status === 'loading' && !current.meta) {
    statusPill.hidden = false;
    statusPill.textContent = `Loading ${requestedDatasetLabel} data...`;
  } else if (current.status === 'loading') {
    statusPill.hidden = false;
    statusPill.textContent = textMode ? 'Sampling documents...' : 'Sampling images...';
  } else if (current.status === 'error') {
    statusPill.hidden = false;
    statusPill.textContent = current.error ?? `Failed to load ${requestedDatasetLabel}.`;
  } else {
    statusPill.hidden = true;
    statusPill.textContent = '';
  }

  const imageWidth = current.meta?.imageWidth ?? DEFAULT_IMAGE_WIDTH;
  const imageHeight = current.meta?.imageHeight ?? DEFAULT_IMAGE_HEIGHT;
  const vectorLength = current.meta?.vectorLength ?? imageWidth * imageHeight;
  vectorLengthEl.textContent = current.meta ? String(vectorLength) : '--';

  gridEl.classList.toggle('is-loading', current.status === 'loading' && !current.samples.length);

  if (current.samples !== lastSamples) {
    renderGrid(gridEl, current.samples, current.selectedId, current.meta, activeDatasetLabel);
    lastSamples = current.samples;
  } else {
    updateGridSelection(gridEl, current.selectedId);
  }

  const selectedSample = getSelectedSample(current);
  const activeImagePixelIndex = textMode ? null : getActiveImagePixelIndex();
  selectedRenderer.renderSelected(
    selectedSample,
    current.meta,
    current.vectorOffset,
    activeDatasetLabel,
    modality,
    activeImagePixelIndex
  );
  vectorRenderer.renderVector(selectedSample, current.vectorOffset, current.meta);
  renderDebug(current);
}

attachAppEventHandlers({
  gridEl,
  vectorSlider,
  vectorList,
  selectedCanvas,
  selectedTextContent,
  datasetSelect,
  resampleBtn,
  getState: () => state,
  dispatch,
  setImageHoverPixelIndex,
  setImagePinnedPixelIndex,
  replaceSamples,
  updateLayoutFromGridSize,
  getGridTargetHeight,
  textHighlighting,
});

void initializeVectorsApp({
  gridEl,
  dispatch,
  replaceSamples,
  getTargetSampleCount: () => state.targetSampleCount,
  updateLayoutFromGridSize,
  getGridTargetHeight,
});
