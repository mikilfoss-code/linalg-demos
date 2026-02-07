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
  debugStatus,
  debugEndpoint,
  debugSource,
  debugSplit,
  debugSizeLabel,
  debugSize,
  debugTotal,
  debugSamples,
  debugSelected,
  debugOffset,
  debugError,
} = createAppView();

const FALLBACK_GRID_LAYOUT = getFallbackGridLayout();

// Initialize CSS grid columns with a reasonable fallback until we can measure.
gridEl.style.setProperty('--grid-columns', String(FALLBACK_GRID_LAYOUT.columns));
gridEl.style.setProperty('--grid-rows', String(FALLBACK_GRID_LAYOUT.rows));

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

function dispatch(action: Action) {
  state = reducer(state, action);
  render(state);
}

const sampling = createSamplingController({
  getState: () => state,
  dispatch,
});

async function syncSamplesToTarget(targetCount: number) {
  await sampling.syncSamplesToTarget(targetCount);
}

async function replaceSamples(count: number) {
  await sampling.replaceSamples(count);
}

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

function setGridRowSize(rowSize: number) {
  if (!Number.isFinite(rowSize) || rowSize <= 0) return;
  // Keep a stable row height so sample count stays tied to measured grid space.
  gridEl.style.setProperty('--grid-row-size', `${rowSize}px`);
}

function updateLayoutFromGridSize(
  width: number,
  height: number,
  options: { syncSamples?: boolean } = {}
) {
  if (width <= 0 || height <= 0) return;
  const { columnGap, rowGap } = getGridGaps(gridEl);
  if (getActiveModality(state) === 'text') {
    const rowSize = getTextTileHeight();
    const rows = computeRowCount(height, rowSize, rowGap);
    const layout = clampGridLayout({ columns: 1, rows }, getGridMaxSamples());
    setGridRowSize(rowSize);
    updateGridLayout(layout, options);
    return;
  }
  const imageWidth = state.meta?.imageWidth ?? DEFAULT_IMAGE_WIDTH;
  const imageHeight = state.meta?.imageHeight ?? DEFAULT_IMAGE_HEIGHT;
  const tileMin = getGridTileMin();
  const { layout, rowSize } = computeGridLayout({
    width,
    height,
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
  getWordWeight: textHighlighting.getWordWeight,
  setVectorHighlight: textHighlighting.setVectorHighlight,
});

function renderDebug(current: AppState) {
  debugStatus.textContent = current.status;
  debugEndpoint.textContent = DATASET_SAMPLES_ENDPOINT;
  debugSource.textContent = current.meta?.source ?? '--';
  debugSplit.textContent = current.meta?.split ?? '--';
  debugSize.textContent = current.meta
    ? current.meta.modality === 'text'
      ? String(current.meta.vectorLength)
      : `${current.meta.imageWidth}x${current.meta.imageHeight}`
    : '--';
  debugTotal.textContent = current.meta ? String(current.meta.totalCount) : '--';
  debugSamples.textContent = String(current.samples.length);
  debugSelected.textContent = current.selectedId !== null ? String(current.selectedId) : '--';
  debugOffset.textContent = String(current.vectorOffset);
  debugError.textContent = current.error ?? '--';
}

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
  debugSizeLabel.textContent = textMode ? 'Vocab size' : 'Image size';
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
  selectedRenderer.renderSelected(
    selectedSample,
    current.meta,
    current.vectorOffset,
    activeDatasetLabel,
    modality
  );
  vectorRenderer.renderVector(selectedSample, current.vectorOffset, current.meta);
  renderDebug(current);
}

attachAppEventHandlers({
  gridEl,
  vectorSlider,
  vectorList,
  selectedTextContent,
  datasetSelect,
  resampleBtn,
  getState: () => state,
  dispatch,
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
