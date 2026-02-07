import './style.css';
import { listDatasets } from './lib/api';
import {
  DATASET_SAMPLES_ENDPOINT,
  loadDatasetSamples,
  toImageData,
  type DatasetMeta,
  type DatasetSample,
  type ImageSample,
  type TextSample,
} from './lib/dataset';
import { type DatasetId, type DatasetModality } from './lib/types';

type GridLayout = { columns: number; rows: number };
type DatasetOption = { id: DatasetId; label: string; modality: DatasetModality };

const VECTOR_WINDOW = 10;
const DEFAULT_IMAGE_WIDTH = 28;
const DEFAULT_IMAGE_HEIGHT = 28;

const DEFAULT_DATASET: DatasetId = 'mnist';
const WORD_REGEX = /\b[a-zA-Z]{2,}\b/g;
const EMAIL_REGEX = /\b[\w.%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

function getDatasetLabel(dataset: DatasetId, options: DatasetOption[]): string {
  return options.find((option) => option.id === dataset)?.label ?? dataset;
}

function getDatasetModality(dataset: DatasetId, options: DatasetOption[]): DatasetModality | null {
  return options.find((option) => option.id === dataset)?.modality ?? null;
}

function isDatasetOption(value: string, options: DatasetOption[]): value is DatasetId {
  return options.some((option) => option.id === value);
}

function isImageSample(sample: DatasetSample | null): sample is ImageSample {
  return sample?.kind === 'image';
}

function isTextSample(sample: DatasetSample | null): sample is TextSample {
  return sample?.kind === 'text';
}

function getActiveModality(current: AppState): DatasetModality | null {
  return current.meta?.modality ?? getDatasetModality(current.dataset, current.datasetOptions);
}

type AppStatus = 'loading' | 'ready' | 'error';

type AppState = {
  status: AppStatus;
  dataset: DatasetId;
  datasetOptions: DatasetOption[];
  meta: DatasetMeta | null;
  samples: DatasetSample[];
  selectedId: number | null;
  vectorOffset: number;
  gridLayout: GridLayout;
  targetSampleCount: number;
  error?: string;
};

type Action =
  | { type: 'load-start' }
  | { type: 'catalog-success'; dataset: DatasetId; datasetOptions: DatasetOption[] }
  | { type: 'load-success'; meta: DatasetMeta; samples: DatasetSample[] }
  | { type: 'load-error'; message: string }
  | { type: 'dataset-change'; dataset: DatasetId }
  | { type: 'samples-start' }
  | { type: 'samples-success'; meta: DatasetMeta; samples: DatasetSample[] }
  | { type: 'samples-append'; meta: DatasetMeta; samples: DatasetSample[] }
  | { type: 'samples-trim'; targetSampleCount: number }
  | { type: 'layout-change'; layout: GridLayout; targetSampleCount: number }
  | { type: 'select'; id: number }
  | { type: 'set-offset'; offset: number }
  | { type: 'shift-offset'; delta: number };

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app element');

app.innerHTML = `
  <main class="app-shell">
    <header class="hero">
      <div class="hero-copy">
        <div class="eyebrow">Linear Algebra Demo</div>
        <h1>Image Vector Explorer</h1>
        <p class="subtitle">
          Pick an image and inspect its pixel vector.
          Scroll through 10 consecutive components at a time.
        </p>
      </div>
      <div class="hero-card">
        <label class="dataset-select-wrap" for="dataset-select">
          <span class="meta-line">Dataset</span>
          <select id="dataset-select" class="dataset-select"></select>
        </label>
        <div class="meta-line">Active source: <span id="dataset-name">--</span></div>
        <div class="meta-line">Sample size: <span id="sample-count">--</span></div>
      </div>
    </header>

    <section class="layout">
      <div class="panel panel-grid">
        <div class="panel-header">
          <div>
            <h2 id="grid-title">Image table</h2>
            <p class="panel-subtitle" id="grid-subtitle">Select an image</p>
          </div>
          <div class="status-pill" id="status-pill">Loading dataset data...</div>
        </div>
        <div
          class="mnist-grid is-loading"
          id="mnist-grid"
          role="grid"
          aria-label="Sample grid"
        ></div>
        <div class="panel-footer">
          <button class="primary" id="resample" type="button">Draw new sample</button>
        </div>
      </div>

      <div class="panel panel-vector">
        <div class="panel-header">
          <div>
            <h2 id="vector-title">Vector window</h2>
            <p class="panel-subtitle" id="vector-subtitle">
            <span id="vector-subtitle-leading">10 components at a time</span>
            <span aria-hidden="true">&middot;</span>
            dimension: <span id="vector-length">--</span>
            </p>
          </div>
          <div class="status-pill" id="selected-status">No selection</div>
        </div>

        <div class="vector-panel">
          <div class="vector-shell">
            <div class="selected-card">
              <canvas id="selected-canvas" width="28" height="28" aria-label="Selected image"></canvas>
              <div class="selected-text" id="selected-text" hidden>
                <div class="selected-text-body">
                  <div
                    class="selected-text-content"
                    id="selected-text-content"
                    tabindex="0"
                    aria-label="Selected document text"
                  ></div>
                </div>
              </div>
            </div>

            <div class="vector-content">
              <div class="vector-controls">
                <div class="vector-range" id="vector-range">Components --</div>
              </div>
              <div class="vector-body">
                <input
                  class="vector-slider"
                  id="vector-slider"
                  type="range"
                  min="0"
                  max="0"
                  step="1"
                  value="0"
                  aria-label="Vector window start"
                  aria-orientation="vertical"
                />
                <div
                  class="vector-list"
                  id="vector-list"
                  tabindex="0"
                  aria-label="Vector component window"
                ></div>
              </div>
            </div>
          </div>
          <p class="hint hint-vector">Scroll or drag the slider to move through vector components.</p>
        </div>
      </div>
    </section>

    <section class="panel panel-debug" aria-live="polite">
      <div class="panel-header">
        <div>
          <h2>Debug panel</h2>
          <p class="panel-subtitle">Backend diagnostics and sampling state.</p>
        </div>
        <div class="status-pill" id="debug-status">--</div>
      </div>
      <div class="debug-grid">
        <div class="debug-item">
          <div class="debug-label">Endpoint</div>
          <div class="debug-value" id="debug-endpoint">--</div>
        </div>
        <div class="debug-item">
          <div class="debug-label">Source</div>
          <div class="debug-value" id="debug-source">--</div>
        </div>
        <div class="debug-item">
          <div class="debug-label">Split</div>
          <div class="debug-value" id="debug-split">--</div>
        </div>
        <div class="debug-item">
          <div class="debug-label" id="debug-size-label">Image size</div>
          <div class="debug-value" id="debug-size">--</div>
        </div>
        <div class="debug-item">
          <div class="debug-label">Total count</div>
          <div class="debug-value" id="debug-total">--</div>
        </div>
        <div class="debug-item">
          <div class="debug-label">Sample count</div>
          <div class="debug-value" id="debug-samples">--</div>
        </div>
        <div class="debug-item">
          <div class="debug-label">Selected id</div>
          <div class="debug-value" id="debug-selected">--</div>
        </div>
        <div class="debug-item">
          <div class="debug-label">Vector offset</div>
          <div class="debug-value" id="debug-offset">--</div>
        </div>
      </div>
      <div class="debug-log">
        <div class="debug-label">Last error</div>
        <pre class="debug-value" id="debug-error">--</pre>
      </div>
    </section>
  </main>
`;

const statusPill = app.querySelector<HTMLDivElement>('#status-pill')!;
const gridTitle = app.querySelector<HTMLHeadingElement>('#grid-title')!;
const gridSubtitle = app.querySelector<HTMLParagraphElement>('#grid-subtitle')!;
const selectedStatus = app.querySelector<HTMLDivElement>('#selected-status')!;
const gridEl = app.querySelector<HTMLDivElement>('#mnist-grid')!;
const vectorPanel = app.querySelector<HTMLDivElement>('.vector-panel')!;
const vectorTitle = app.querySelector<HTMLHeadingElement>('#vector-title')!;
const vectorSubtitleLeading = app.querySelector<HTMLSpanElement>('#vector-subtitle-leading')!;
const datasetSelect = app.querySelector<HTMLSelectElement>('#dataset-select')!;
const datasetNameEl = app.querySelector<HTMLSpanElement>('#dataset-name')!;
const resampleBtn = app.querySelector<HTMLButtonElement>('#resample')!;
const sampleCountEl = app.querySelector<HTMLSpanElement>('#sample-count')!;
const selectedCard = app.querySelector<HTMLDivElement>('.selected-card')!;
const selectedCanvas = app.querySelector<HTMLCanvasElement>('#selected-canvas')!;
const selectedText = app.querySelector<HTMLDivElement>('#selected-text')!;
const selectedTextContent = app.querySelector<HTMLDivElement>('#selected-text-content')!;
// Offscreen buffer keeps ImageData scaling crisp without relying on CSS scaling.
const selectedBuffer = document.createElement('canvas');
const selectedBufferCtx = selectedBuffer.getContext('2d');
const vectorLengthEl = app.querySelector<HTMLDivElement>('#vector-length')!;
const vectorRangeEl = app.querySelector<HTMLDivElement>('#vector-range')!;
const vectorSlider = app.querySelector<HTMLInputElement>('#vector-slider')!;
const vectorList = app.querySelector<HTMLDivElement>('#vector-list')!;
const debugStatus = app.querySelector<HTMLDivElement>('#debug-status')!;
const debugEndpoint = app.querySelector<HTMLDivElement>('#debug-endpoint')!;
const debugSource = app.querySelector<HTMLDivElement>('#debug-source')!;
const debugSplit = app.querySelector<HTMLDivElement>('#debug-split')!;
const debugSizeLabel = app.querySelector<HTMLDivElement>('#debug-size-label')!;
const debugSize = app.querySelector<HTMLDivElement>('#debug-size')!;
const debugTotal = app.querySelector<HTMLDivElement>('#debug-total')!;
const debugSamples = app.querySelector<HTMLDivElement>('#debug-samples')!;
const debugSelected = app.querySelector<HTMLDivElement>('#debug-selected')!;
const debugOffset = app.querySelector<HTMLDivElement>('#debug-offset')!;
const debugError = app.querySelector<HTMLPreElement>('#debug-error')!;

// Layout tokens live in theme.css; read them from CSS variables to avoid duplication.
function getCssNumber(name: string, fallback: number): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getCssInt(name: string, fallback: number): number {
  return Math.max(1, Math.floor(getCssNumber(name, fallback)));
}

function getGridTileMin(): number {
  return getCssNumber('--grid-tile-min', 100);
}

function getGridTileMax(min: number): number {
  return Math.max(getCssNumber('--grid-tile-max', 180), min);
}

function getTextTileHeight(): number {
  return getCssNumber('--text-tile-min-height', 96);
}

function getGridMaxSamples(): number {
  return getCssInt('--grid-max-samples', 64);
}

function getGridHeightVh(): number {
  return getCssNumber('--grid-height-vh', 55);
}

function getFallbackGridLayout(): GridLayout {
  return {
    columns: getCssInt('--grid-fallback-columns', 2),
    rows: getCssInt('--grid-fallback-rows', 5),
  };
}

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

function renderDatasetOptions(options: DatasetOption[], selectedDataset: DatasetId) {
  datasetSelect.textContent = '';
  const fragment = document.createDocumentFragment();
  options.forEach((option) => {
    const optionEl = document.createElement('option');
    optionEl.value = option.id;
    optionEl.textContent = option.label;
    fragment.appendChild(optionEl);
  });
  datasetSelect.appendChild(fragment);
  datasetSelect.value = selectedDataset;
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
let sampleRequestId = 0;
let isSampling = false;
let lastTextSignature = '';
let activeTextWordSpans = new Map<string, HTMLSpanElement[]>();
let activeTextWordWeights = new Map<string, number>();
let activeHighlightedWord: string | null = null;
let vocabIndexMap: Map<string, number> | null = null;
let vocabSignature = '';
let lastModality: DatasetModality | null = null;
let textWordWidthSignature = '';

function nextSampleRequestId(): number {
  sampleRequestId += 1;
  return sampleRequestId;
}

function cancelPendingSampleRequest() {
  sampleRequestId += 1;
}

function parsePixelValue(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getCanvasContentSize(
  canvas: HTMLCanvasElement,
  fallbackWidth: number,
  fallbackHeight: number
): { width: number; height: number } {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return { width: fallbackWidth, height: fallbackHeight };
  }
  const styles = getComputedStyle(canvas);
  const paddingX = parsePixelValue(styles.paddingLeft) + parsePixelValue(styles.paddingRight);
  const paddingY = parsePixelValue(styles.paddingTop) + parsePixelValue(styles.paddingBottom);
  return {
    width: Math.max(1, rect.width - paddingX),
    height: Math.max(1, rect.height - paddingY),
  };
}

function syncCanvasToDisplay(
  canvas: HTMLCanvasElement,
  fallbackWidth: number,
  fallbackHeight: number
): { width: number; height: number; scale: number } {
  const contentSize = getCanvasContentSize(canvas, fallbackWidth, fallbackHeight);
  const scale = window.devicePixelRatio || 1;
  const pixelWidth = Math.max(1, Math.round(contentSize.width * scale));
  const pixelHeight = Math.max(1, Math.round(contentSize.height * scale));

  // Match the canvas backing store to its CSS size so 1px strokes stay 1px.
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  return {
    width: canvas.width / scale,
    height: canvas.height / scale,
    scale,
  };
}

function clampGridLayout(layout: GridLayout): GridLayout {
  let columns = Math.max(1, Math.floor(layout.columns));
  let rows = Math.max(1, Math.floor(layout.rows));
  const maxSamples = getGridMaxSamples();
  if (columns * rows > maxSamples) {
    // Prefer trimming rows to preserve column count (keeps tile max cap strict).
    if (columns > maxSamples) {
      columns = maxSamples;
      rows = 1;
    } else {
      rows = Math.max(1, Math.floor(maxSamples / columns));
    }
  }

  return { columns, rows };
}

function computeColumnCount(width: number, tileSize: number, columnGap: number): number {
  if (tileSize <= 0 || width <= 0) return 1;
  return Math.max(1, Math.floor((width + columnGap) / (tileSize + columnGap)));
}

function computeColumnCountForMax(width: number, tileSize: number, columnGap: number): number {
  if (tileSize <= 0 || width <= 0) return 1;
  return Math.max(1, Math.ceil((width + columnGap) / (tileSize + columnGap)));
}

function computeRowSize(width: number, columns: number, columnGap: number): number {
  if (columns <= 0 || width <= 0) return 1;
  const totalGaps = columnGap * (columns - 1);
  const available = Math.max(0, width - totalGaps);
  return Math.max(1, available / columns);
}

function computeRowCount(height: number, rowSize: number, rowGap: number): number {
  if (rowSize <= 0 || height <= 0) return 1;
  return Math.max(1, Math.floor((height + rowGap) / (rowSize + rowGap)));
}

function computeGridLayout(
  width: number,
  height: number,
  columnGap: number,
  rowGap: number,
  imageWidth: number,
  imageHeight: number
): { layout: GridLayout; rowSize: number } {
  const tileMin = getGridTileMin();
  const tileMax = getGridTileMax(tileMin);
  const maxColumnsForMin = computeColumnCount(width, tileMin, columnGap);
  const minColumnsForMax = computeColumnCountForMax(width, tileMax, columnGap);

  // Start from the width-driven tile size, then enforce the strict max cap.
  let columns = Math.max(1, maxColumnsForMin);
  if (minColumnsForMax > columns) {
    columns = minColumnsForMax;
  }

  const ratio = imageHeight > 0 ? imageHeight / Math.max(imageWidth, 1) : 1;
  const aspectFloor = Math.max(1, ratio);
  let rowSize = computeRowSize(width, columns, columnGap);
  rowSize = Math.max(rowSize, rowSize * aspectFloor);
  let rows = computeRowCount(height, rowSize, rowGap);
  let layout = clampGridLayout({ columns, rows });

  // If max-sample clamping reduces columns, recompute row sizing.
  if (layout.columns !== columns) {
    rowSize = computeRowSize(width, layout.columns, columnGap);
    rowSize = Math.max(rowSize, rowSize * aspectFloor);
    rows = computeRowCount(height, rowSize, rowGap);
    layout = clampGridLayout({ columns: layout.columns, rows });
  }

  return { layout, rowSize };
}

function clampOffset(offset: number, vectorLength: number): number {
  const maxOffset = Math.max(0, vectorLength - VECTOR_WINDOW);
  return Math.min(Math.max(offset, 0), maxOffset);
}

function getSliderMax(vectorLength: number): number {
  return Math.max(0, vectorLength - VECTOR_WINDOW);
}

// Invert slider values so the top position maps to offset 0.
function offsetToSliderValue(offset: number, sliderMax: number): number {
  return sliderMax - offset;
}

function sliderValueToOffset(value: number, sliderMax: number): number {
  return sliderMax - value;
}

function ensureVocabIndexMap(meta: DatasetMeta | null): Map<string, number> | null {
  const vocab = meta?.vocab ?? null;
  if (!vocab || vocab.length === 0) {
    vocabIndexMap = null;
    vocabSignature = '';
    return null;
  }
  const signature = `${meta?.source ?? 'unknown'}:${vocab.length}`;
  if (signature !== vocabSignature || !vocabIndexMap) {
    const nextMap = new Map<string, number>();
    vocab.forEach((word, index) => {
      nextMap.set(word, index);
    });
    vocabIndexMap = nextMap;
    vocabSignature = signature;
  }
  return vocabIndexMap;
}

function clearTextHighlight() {
  if (!activeHighlightedWord) return;
  const spans = activeTextWordSpans.get(activeHighlightedWord);
  spans?.forEach((span) => {
    span.classList.remove('is-highlighted');
    span.style.removeProperty('--word-highlight-alpha');
  });
  activeHighlightedWord = null;
}

function clearVectorHighlight() {
  const rows = vectorList.querySelectorAll<HTMLElement>('.vector-row.is-text.is-highlighted');
  rows.forEach((row) => {
    row.classList.remove('is-highlighted');
    row.style.removeProperty('--vector-word-highlight-alpha');
  });
}

function setVectorHighlight(word: string | null, weight: number) {
  clearVectorHighlight();
  if (!word || weight <= 0) return;

  const rows = vectorList.querySelectorAll<HTMLElement>('.vector-row.is-text');
  rows.forEach((row) => {
    const rowWord = row.dataset.word;
    const count = Number(row.dataset.count) || 0;
    if (rowWord === word && count > 0) {
      row.classList.add('is-highlighted');
      row.style.setProperty('--vector-word-highlight-alpha', String(weight));
    }
  });
}

function setTextHighlight(word: string | null, weight: number) {
  if (!word || weight <= 0) {
    clearTextHighlight();
    clearVectorHighlight();
    return;
  }
  clearTextHighlight();
  clearVectorHighlight();
  setVectorHighlight(word, weight);
  const spans = activeTextWordSpans.get(word);
  if (spans && spans.length > 0) {
    spans.forEach((span) => {
      span.classList.add('is-highlighted');
      span.style.setProperty('--word-highlight-alpha', String(weight));
    });
  }
  activeHighlightedWord = word;
}

function updateVectorTextWordWidth(meta: DatasetMeta | null) {
  if (!meta || meta.modality !== 'text' || !meta.vocab || meta.vocab.length === 0) {
    vectorPanel.style.removeProperty('--vector-text-word-width-dynamic');
    textWordWidthSignature = '';
    return;
  }

  const signature = `${meta.source}:${meta.vectorLength}:${meta.vocab.length}`;
  if (signature === textWordWidthSignature) {
    return;
  }

  const longestWordLength = meta.vocab.reduce((longest, word) => Math.max(longest, word.length), 2);
  vectorPanel.style.setProperty('--vector-text-word-width-dynamic', `${longestWordLength}ch`);
  textWordWidthSignature = signature;
}

function getEmailRanges(text: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  EMAIL_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = EMAIL_REGEX.exec(text)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  return ranges;
}

function isInsideRanges(index: number, ranges: Array<{ start: number; end: number }>): boolean {
  for (const range of ranges) {
    if (index >= range.start && index < range.end) {
      return true;
    }
  }
  return false;
}

function getSelectedSample(current: AppState): DatasetSample | null {
  if (current.selectedId === null) return null;
  return current.samples[current.selectedId] ?? null;
}

function getSelectedVectorLength(current: AppState, selected: DatasetSample | null): number {
  if (!selected || !current.meta) return 0;
  if (current.meta.modality === 'text') {
    return current.meta.vectorLength;
  }
  if (isImageSample(selected)) {
    return selected.vector.length;
  }
  return current.meta.vectorLength;
}

function reducer(current: AppState, action: Action): AppState {
  switch (action.type) {
    case 'load-start':
      return { ...current, status: 'loading', error: undefined };
    case 'catalog-success':
      return {
        ...current,
        status: 'loading',
        dataset: action.dataset,
        datasetOptions: action.datasetOptions,
        meta: null,
        samples: [],
        selectedId: null,
        vectorOffset: 0,
        error: undefined,
      };
    case 'load-success':
      return {
        status: 'ready',
        dataset: current.dataset,
        datasetOptions: current.datasetOptions,
        meta: action.meta,
        samples: action.samples,
        selectedId: action.samples.length ? 0 : null,
        vectorOffset: 0,
        gridLayout: current.gridLayout,
        targetSampleCount: current.targetSampleCount,
      };
    case 'load-error':
      return { ...current, status: 'error', error: action.message };
    case 'dataset-change':
      return {
        ...current,
        dataset: action.dataset,
        status: 'loading',
        meta: null,
        samples: [],
        selectedId: null,
        vectorOffset: 0,
        error: undefined,
      };
    case 'samples-start':
      return { ...current, status: 'loading', error: undefined };
    case 'samples-success':
      return {
        ...current,
        status: 'ready',
        meta: action.meta,
        samples: action.samples,
        selectedId: action.samples.length ? 0 : null,
        vectorOffset: 0,
      };
    case 'samples-append': {
      const nextSamples = [...current.samples, ...action.samples];
      const nextSelected = current.selectedId ?? (nextSamples.length ? 0 : null);
      return {
        ...current,
        status: 'ready',
        meta: action.meta,
        samples: nextSamples,
        selectedId: nextSelected,
      };
    }
    case 'samples-trim': {
      const nextSamples = current.samples.slice(0, action.targetSampleCount);
      let nextSelectedId = current.selectedId;
      if (!nextSamples.length) {
        nextSelectedId = null;
      } else if (nextSelectedId === null || nextSelectedId >= nextSamples.length) {
        nextSelectedId = nextSamples.length - 1;
      }
      const nextOffset = nextSelectedId !== current.selectedId ? 0 : current.vectorOffset;
      return {
        ...current,
        status: current.status === 'error' ? 'error' : 'ready',
        samples: nextSamples,
        selectedId: nextSelectedId,
        vectorOffset: nextOffset,
      };
    }
    case 'layout-change':
      return {
        ...current,
        gridLayout: action.layout,
        targetSampleCount: action.targetSampleCount,
      };
    case 'select':
      return {
        ...current,
        selectedId: action.id,
        vectorOffset: 0,
      };
    case 'set-offset': {
      const selected = getSelectedSample(current);
      const vectorLength = getSelectedVectorLength(current, selected);
      if (!selected || vectorLength <= 0) return current;
      const nextOffset = clampOffset(action.offset, vectorLength);
      return { ...current, vectorOffset: nextOffset };
    }
    case 'shift-offset': {
      const selected = getSelectedSample(current);
      const vectorLength = getSelectedVectorLength(current, selected);
      if (!selected || vectorLength <= 0) return current;
      const nextOffset = clampOffset(current.vectorOffset + action.delta, vectorLength);
      return { ...current, vectorOffset: nextOffset };
    }
    default:
      return current;
  }
}

function dispatch(action: Action) {
  state = reducer(state, action);
  render(state);
}

function updateGridLayout(nextLayout: GridLayout, options: { syncSamples?: boolean } = {}) {
  const { syncSamples = true } = options;
  const normalized = clampGridLayout(nextLayout);
  const nextCount = normalized.columns * normalized.rows;

  if (
    normalized.columns === state.gridLayout.columns &&
    normalized.rows === state.gridLayout.rows &&
    nextCount === state.targetSampleCount
  ) {
    if (syncSamples) {
      syncSamplesToTarget(state.targetSampleCount);
    }
    return;
  }

  gridEl.style.setProperty('--grid-columns', String(normalized.columns));
  gridEl.style.setProperty('--grid-rows', String(normalized.rows));
  dispatch({ type: 'layout-change', layout: normalized, targetSampleCount: nextCount });

  if (syncSamples) {
    syncSamplesToTarget(nextCount);
  }
}

function trimSamples(targetCount: number) {
  if (state.samples.length <= targetCount) return;
  cancelPendingSampleRequest();
  dispatch({ type: 'samples-trim', targetSampleCount: targetCount });
}

async function appendSamples(missingCount: number) {
  if (missingCount <= 0) return;
  if (isSampling) return;
  isSampling = true;
  const dataset = state.dataset;
  const requestId = nextSampleRequestId();
  dispatch({ type: 'samples-start' });
  const result = await loadDatasetSamples(dataset, missingCount);
  if (requestId !== sampleRequestId) {
    isSampling = false;
    return;
  }
  if (!result.ok) {
    isSampling = false;
    dispatch({ type: 'load-error', message: result.error.message });
    return;
  }
  dispatch({ type: 'samples-append', meta: result.value.meta, samples: result.value.samples });
  isSampling = false;

  // If the layout expanded again while loading, fetch the remaining slots.
  const remaining = state.targetSampleCount - state.samples.length;
  if (remaining > 0) {
    void appendSamples(remaining);
  }
}

async function replaceSamples(count: number) {
  cancelPendingSampleRequest();
  isSampling = true;
  const dataset = state.dataset;
  const requestId = nextSampleRequestId();
  dispatch({ type: 'samples-start' });
  const result = await loadDatasetSamples(dataset, count);
  if (requestId !== sampleRequestId) {
    isSampling = false;
    return;
  }
  if (!result.ok) {
    isSampling = false;
    dispatch({ type: 'load-error', message: result.error.message });
    return;
  }
  dispatch({ type: 'samples-success', meta: result.value.meta, samples: result.value.samples });
  isSampling = false;
  syncSamplesToTarget(state.targetSampleCount);
}

function syncSamplesToTarget(targetCount: number) {
  if (state.samples.length > targetCount) {
    trimSamples(targetCount);
    return;
  }
  const missing = targetCount - state.samples.length;
  if (missing > 0) {
    void appendSamples(missing);
  }
}

function getGridGaps() {
  const styles = getComputedStyle(gridEl);
  return {
    columnGap: parsePixelValue(styles.columnGap || styles.gap || '0'),
    rowGap: parsePixelValue(styles.rowGap || styles.gap || '0'),
  };
}

function getGridTargetHeight(): number {
  return window.innerHeight * (getGridHeightVh() / 100);
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
  const { columnGap, rowGap } = getGridGaps();
  if (getActiveModality(state) === 'text') {
    const rowSize = getTextTileHeight();
    const rows = computeRowCount(height, rowSize, rowGap);
    const layout = clampGridLayout({ columns: 1, rows });
    setGridRowSize(rowSize);
    updateGridLayout(layout, options);
    return;
  }
  const imageWidth = state.meta?.imageWidth ?? DEFAULT_IMAGE_WIDTH;
  const imageHeight = state.meta?.imageHeight ?? DEFAULT_IMAGE_HEIGHT;
  const { layout, rowSize } = computeGridLayout(
    width,
    height,
    columnGap,
    rowGap,
    imageWidth,
    imageHeight
  );
  setGridRowSize(rowSize);
  updateGridLayout(layout, options);
}

function renderGrid(
  samples: DatasetSample[],
  selectedId: number | null,
  meta: DatasetMeta | null,
  sourceLabel: string
) {
  gridEl.textContent = '';
  if (!meta) return;
  if (meta.modality === 'text') {
    renderTextGrid(samples.filter(isTextSample), selectedId, sourceLabel);
  } else {
    renderImageGrid(
      samples.filter(isImageSample),
      selectedId,
      meta.imageWidth,
      meta.imageHeight,
      sourceLabel
    );
  }
}

function renderImageGrid(
  samples: ImageSample[],
  selectedId: number | null,
  imageWidth: number,
  imageHeight: number,
  sourceLabel: string
) {
  const fragment = document.createDocumentFragment();

  samples.forEach((sample, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mnist-tile';
    button.dataset.sampleId = String(i);
    button.setAttribute('role', 'gridcell');
    button.setAttribute('aria-pressed', i === selectedId ? 'true' : 'false');
    button.classList.toggle('is-selected', i === selectedId);
    button.setAttribute('aria-label', `${sourceLabel} index ${sample.index}`);
    button.style.setProperty('--i', String(i));
    button.style.setProperty('--tile-aspect-ratio', `${imageWidth} / ${imageHeight}`);

    const canvas = document.createElement('canvas');
    canvas.width = imageWidth;
    canvas.height = imageHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      ctx.putImageData(toImageData(sample, imageWidth, imageHeight), 0, 0);
    }

    button.appendChild(canvas);
    fragment.appendChild(button);
  });

  gridEl.appendChild(fragment);
}

function renderTextGrid(
  samples: TextSample[],
  selectedId: number | null,
  sourceLabel: string
) {
  const fragment = document.createDocumentFragment();

  samples.forEach((sample, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mnist-tile text-tile';
    button.dataset.sampleId = String(i);
    button.setAttribute('role', 'gridcell');
    button.setAttribute('aria-pressed', i === selectedId ? 'true' : 'false');
    button.classList.toggle('is-selected', i === selectedId);
    button.setAttribute('aria-label', `${sourceLabel} document ${sample.index}`);
    button.style.setProperty('--i', String(i));

    const snippet = document.createElement('div');
    snippet.className = 'text-snippet';
    snippet.textContent = sample.snippet || sample.rawText || '';

    button.appendChild(snippet);
    fragment.appendChild(button);
  });

  gridEl.appendChild(fragment);
}

function updateGridSelection(selectedId: number | null) {
  const buttons = gridEl.querySelectorAll<HTMLButtonElement>('[data-sample-id]');
  buttons.forEach((button) => {
    const id = Number(button.dataset.sampleId);
    button.setAttribute('aria-pressed', id === selectedId ? 'true' : 'false');
    button.classList.toggle('is-selected', id === selectedId);
  });
}

function drawVectorWindowOutline(
  ctx: CanvasRenderingContext2D,
  imageWidth: number,
  imageHeight: number,
  displayWidth: number,
  displayHeight: number,
  offset: number,
  windowSize: number,
  vectorLength: number
) {
  // The window is a linear slice, so it can span row boundaries.
  const start = clampOffset(offset, vectorLength);
  const endExclusive = Math.min(vectorLength, start + windowSize);
  if (endExclusive <= start) return;

  ctx.save();
  ctx.strokeStyle = getOutlineColor();
  ctx.lineWidth = 1;
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'square';

  const cellWidth = displayWidth / imageWidth;
  const cellHeight = displayHeight / imageHeight;
  if (
    !Number.isFinite(cellWidth) ||
    !Number.isFinite(cellHeight) ||
    cellWidth <= 0 ||
    cellHeight <= 0
  ) {
    ctx.restore();
    return;
  }

  const startRow = Math.floor(start / imageWidth);
  const startCol = start % imageWidth;
  const endIndex = endExclusive - 1;
  const endRow = Math.floor(endIndex / imageWidth);
  const endCol = endIndex % imageWidth;

  const drawRowOutline = (row: number, colStart: number, colEnd: number) => {
    if (colEnd < colStart) return;
    const width = (colEnd - colStart + 1) * cellWidth;
    const height = cellHeight;
    const x = colStart * cellWidth;
    const y = row * cellHeight;
    // Keep the 1px stroke inside the row bounds for a crisp outline.
    ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, width - 1), Math.max(0, height - 1));
  };

  if (startRow === endRow) {
    drawRowOutline(startRow, startCol, endCol);
  } else {
    drawRowOutline(startRow, startCol, imageWidth - 1);
    for (let row = startRow + 1; row < endRow; row += 1) {
      drawRowOutline(row, 0, imageWidth - 1);
    }
    drawRowOutline(endRow, 0, endCol);
  }

  ctx.restore();
}

function renderSelected(
  sample: DatasetSample | null,
  meta: DatasetMeta | null,
  offset: number,
  sourceLabel: string,
  fallbackModality: DatasetModality | null
) {
  if (!meta) {
    selectedStatus.textContent = 'No selection';
    if (fallbackModality === 'text') {
      selectedCard.classList.add('is-text-mode');
      selectedCanvas.hidden = true;
      selectedText.hidden = false;
      selectedTextContent.textContent = 'Select a document to view its text.';
    } else {
      selectedCard.classList.remove('is-text-mode');
      selectedCanvas.hidden = false;
      selectedText.hidden = true;
      selectedTextContent.textContent = '';
    }
    return;
  }

  if (meta.modality === 'text') {
    renderSelectedText(isTextSample(sample) ? sample : null, meta, sourceLabel);
  } else {
    renderSelectedImage(isImageSample(sample) ? sample : null, meta, offset, sourceLabel);
  }
}

function renderSelectedImage(
  sample: ImageSample | null,
  meta: DatasetMeta,
  offset: number,
  sourceLabel: string
) {
  selectedCard.classList.remove('is-text-mode');
  selectedCanvas.hidden = false;
  selectedText.hidden = true;
  const ctx = selectedCanvas.getContext('2d');
  if (!ctx) return;
  selectedCanvas.style.setProperty('--selected-canvas-aspect', `${meta.imageWidth} / ${meta.imageHeight}`);
  const { width: displayWidth, height: displayHeight, scale } = syncCanvasToDisplay(
    selectedCanvas,
    meta.imageWidth,
    meta.imageHeight
  );
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, displayWidth, displayHeight);

  if (!sample) {
    selectedStatus.textContent = 'No selection';
    return;
  }

  if (selectedBufferCtx) {
    if (selectedBuffer.width !== meta.imageWidth || selectedBuffer.height !== meta.imageHeight) {
      selectedBuffer.width = meta.imageWidth;
      selectedBuffer.height = meta.imageHeight;
    }
    selectedBufferCtx.putImageData(toImageData(sample, meta.imageWidth, meta.imageHeight), 0, 0);
    ctx.drawImage(selectedBuffer, 0, 0, displayWidth, displayHeight);
  } else {
    ctx.putImageData(toImageData(sample, meta.imageWidth, meta.imageHeight), 0, 0);
  }

  drawVectorWindowOutline(
    ctx,
    meta.imageWidth,
    meta.imageHeight,
    displayWidth,
    displayHeight,
    offset,
    VECTOR_WINDOW,
    sample.vector.length
  );
  const label = sample.labelName ? sample.labelName : `label ${sample.label}`;
  selectedStatus.textContent = `${sourceLabel} #${sample.index} (${label})`;
}

function renderSelectedText(sample: TextSample | null, meta: DatasetMeta, sourceLabel: string) {
  selectedCard.classList.add('is-text-mode');
  selectedCanvas.hidden = true;
  selectedText.hidden = false;

  if (!sample) {
    selectedStatus.textContent = 'No selection';
    selectedTextContent.textContent = 'Select a document to view its text.';
    return;
  }

  const label = sample.labelName ? sample.labelName : `label ${sample.label}`;
  selectedStatus.textContent = `${sourceLabel} #${sample.index} (${label})`;

  const signature = `${meta.source}:${sample.index}`;
  if (signature !== lastTextSignature) {
    renderSelectedTextContent(sample, meta);
    lastTextSignature = signature;
  }
}

function renderSelectedTextContent(sample: TextSample, meta: DatasetMeta) {
  clearTextHighlight();
  activeTextWordSpans = new Map<string, HTMLSpanElement[]>();
  activeTextWordWeights = new Map<string, number>();
  selectedTextContent.textContent = '';
  selectedTextContent.scrollTop = 0;

  const vocabMap = ensureVocabIndexMap(meta);
  if (!vocabMap) {
    selectedTextContent.textContent = sample.rawText;
    return;
  }

  const fragment = document.createDocumentFragment();
  const text = sample.rawText;
  const emailRanges = getEmailRanges(text);
  sample.wordCounts.forEach((entry) => {
    const word = meta.vocab?.[entry.index];
    if (word) {
      activeTextWordWeights.set(word, entry.weight);
    }
  });
  WORD_REGEX.lastIndex = 0;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WORD_REGEX.exec(text)) !== null) {
    const start = match.index;
    const word = match[0];
    const end = start + word.length;
    if (start > lastIndex) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex, start)));
    }
    if (isInsideRanges(start, emailRanges)) {
      fragment.appendChild(document.createTextNode(word));
      lastIndex = end;
      continue;
    }

    const normalized = word.toLowerCase();
    const vocabIndex = vocabMap.get(normalized);
    if (vocabIndex !== undefined) {
      const span = document.createElement('span');
      span.className = 'text-word';
      span.textContent = word;
      span.dataset.word = normalized;
      span.dataset.index = String(vocabIndex);
      const entries = activeTextWordSpans.get(normalized);
      if (entries) {
        entries.push(span);
      } else {
        activeTextWordSpans.set(normalized, [span]);
      }
      fragment.appendChild(span);
    } else {
      fragment.appendChild(document.createTextNode(word));
    }
    lastIndex = end;
  }
  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
  selectedTextContent.appendChild(fragment);
}

function renderVector(sample: DatasetSample | null, offset: number, meta: DatasetMeta | null) {
  if (!sample || !meta) {
    vectorRangeEl.textContent = 'Components --';
    vectorSlider.value = '0';
    vectorSlider.max = '0';
    vectorList.innerHTML = `<div class="vector-empty">Select a sample to view its vector.</div>`;
    return;
  }

  if (meta.modality === 'text' && isTextSample(sample)) {
    renderTextVector(sample, offset, meta);
  } else if (isImageSample(sample)) {
    renderImageVector(sample, offset);
  }
}

function renderImageVector(sample: ImageSample, offset: number) {
  const vector = sample.vector;
  const clampedOffset = clampOffset(offset, vector.length);
  const end = Math.min(vector.length, clampedOffset + VECTOR_WINDOW);
  const sliderMax = getSliderMax(vector.length);

  vectorRangeEl.textContent = `Components ${clampedOffset + 1} - ${end}`;
  vectorSlider.max = String(sliderMax);
  vectorSlider.value = String(offsetToSliderValue(clampedOffset, sliderMax));

  vectorList.textContent = '';
  const fragment = document.createDocumentFragment();

  // Only render the active window to keep the DOM small and responsive.
  for (let i = clampedOffset; i < end; i += 1) {
    const value = vector[i];
    const row = document.createElement('div');
    row.className = 'vector-row';

    const indexEl = document.createElement('div');
    indexEl.className = 'vector-index';
    indexEl.textContent = String(i + 1);

    const valueEl = document.createElement('div');
    valueEl.className = 'vector-value';
    valueEl.textContent = value.toFixed(3);

    const swatch = document.createElement('div');
    swatch.className = 'vector-swatch';
    // Map the 0..1 vector value back to a grayscale pixel color.
    const clamped = Math.min(Math.max(value, 0), 1);
    const channel = Math.round(clamped * 255);
    swatch.style.backgroundColor = `rgb(${channel}, ${channel}, ${channel})`;

    row.appendChild(indexEl);
    row.appendChild(swatch);
    row.appendChild(valueEl);
    fragment.appendChild(row);
  }

  vectorList.appendChild(fragment);
}

function renderTextVector(sample: TextSample, offset: number, meta: DatasetMeta) {
  const vectorLength = meta.vectorLength;
  const clampedOffset = clampOffset(offset, vectorLength);
  const end = Math.min(vectorLength, clampedOffset + VECTOR_WINDOW);
  const sliderMax = getSliderMax(vectorLength);

  vectorRangeEl.textContent = `Components ${clampedOffset + 1} - ${end}`;
  vectorSlider.max = String(sliderMax);
  vectorSlider.value = String(offsetToSliderValue(clampedOffset, sliderMax));

  const wordCounts = new Map<number, { count: number; weight: number }>();
  sample.wordCounts.forEach((entry) => {
    wordCounts.set(entry.index, { count: entry.count, weight: entry.weight });
  });

  vectorList.textContent = '';
  const fragment = document.createDocumentFragment();

  for (let i = clampedOffset; i < end; i += 1) {
    const row = document.createElement('div');
    row.className = 'vector-row is-text';
    row.dataset.index = String(i);

    const word = meta.vocab?.[i] ?? '';
    if (word) {
      row.dataset.word = word;
    }
    const entry = wordCounts.get(i);
    const count = entry?.count ?? 0;
    const weight = entry?.weight ?? 0;
    row.dataset.weight = String(weight);
    row.dataset.count = String(count);

    const indexEl = document.createElement('div');
    indexEl.className = 'vector-index';
    indexEl.textContent = String(i + 1);

    const wordEl = document.createElement('div');
    wordEl.className = 'vector-word';
    wordEl.textContent = word || '--';

    const countEl = document.createElement('div');
    countEl.className = 'vector-count';
    countEl.textContent = String(count);

    row.appendChild(indexEl);
    row.appendChild(wordEl);
    row.appendChild(countEl);
    fragment.appendChild(row);
  }

  vectorList.appendChild(fragment);
  if (activeHighlightedWord) {
    const weight = activeTextWordWeights.get(activeHighlightedWord) ?? 0;
    setVectorHighlight(activeHighlightedWord, weight);
  }
}

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

  renderDatasetOptions(current.datasetOptions, current.dataset);
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
  updateVectorTextWordWidth(current.meta);
  if (!textMode) {
    clearTextHighlight();
    activeTextWordSpans = new Map<string, HTMLSpanElement[]>();
    activeTextWordWeights = new Map<string, number>();
    lastTextSignature = '';
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
    renderGrid(current.samples, current.selectedId, current.meta, activeDatasetLabel);
    lastSamples = current.samples;
  } else {
    updateGridSelection(current.selectedId);
  }

  const selectedSample = getSelectedSample(current);
  renderSelected(
    selectedSample,
    current.meta,
    current.vectorOffset,
    activeDatasetLabel,
    modality
  );
  renderVector(selectedSample, current.vectorOffset, current.meta);
  renderDebug(current);
}

// ResizeObserver keeps the grid layout responsive without polling.
const gridObserver = new ResizeObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.target !== gridEl) return;
    updateLayoutFromGridSize(entry.contentRect.width, getGridTargetHeight(), {
      syncSamples: state.meta !== null,
    });
  });
});

gridObserver.observe(gridEl);

window.addEventListener('resize', () => {
  const { width } = gridEl.getBoundingClientRect();
  updateLayoutFromGridSize(width, getGridTargetHeight(), {
    syncSamples: state.meta !== null,
  });
});

gridEl.addEventListener('click', (event) => {
  const target = event.target as HTMLElement | null;
  const button = target?.closest<HTMLButtonElement>('[data-sample-id]');
  if (!button) return;
  const id = Number(button.dataset.sampleId);
  if (Number.isNaN(id)) return;
  dispatch({ type: 'select', id });
});

vectorSlider.addEventListener('input', (event) => {
  const selected = getSelectedSample(state);
  const vectorLength = getSelectedVectorLength(state, selected);
  if (!selected || vectorLength <= 0) return;
  const rawValue = Number((event.target as HTMLInputElement).value);
  const sliderMax = Number(vectorSlider.max) || 0;
  const nextOffset = clampOffset(sliderValueToOffset(rawValue, sliderMax), vectorLength);
  dispatch({ type: 'set-offset', offset: nextOffset });
});

vectorList.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault();
    const delta = Math.sign(event.deltaY);
    if (delta !== 0) {
      dispatch({ type: 'shift-offset', delta });
    }
  },
  { passive: false }
);

vectorList.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    dispatch({ type: 'shift-offset', delta: 1 });
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    dispatch({ type: 'shift-offset', delta: -1 });
  } else if (event.key === 'PageDown') {
    event.preventDefault();
    dispatch({ type: 'shift-offset', delta: VECTOR_WINDOW });
  } else if (event.key === 'PageUp') {
    event.preventDefault();
    dispatch({ type: 'shift-offset', delta: -VECTOR_WINDOW });
  } else if (event.key === 'Home') {
    event.preventDefault();
    dispatch({ type: 'set-offset', offset: 0 });
  } else if (event.key === 'End') {
    event.preventDefault();
    const selected = getSelectedSample(state);
    const vectorLength = getSelectedVectorLength(state, selected);
    if (!selected || vectorLength <= 0) return;
    dispatch({
      type: 'set-offset',
      offset: Math.max(0, vectorLength - VECTOR_WINDOW),
    });
  }
});

vectorList.addEventListener('pointerover', (event) => {
  if (getActiveModality(state) !== 'text') return;
  const target = event.target as HTMLElement | null;
  const row = target?.closest<HTMLElement>('.vector-row.is-text');
  if (!row) return;
  const count = Number(row.dataset.count) || 0;
  if (count <= 0) {
    clearTextHighlight();
    clearVectorHighlight();
    return;
  }
  const word = row.dataset.word;
  const weight = Number(row.dataset.weight) || 0;
  if (word) {
    setTextHighlight(word, weight);
  }
});

vectorList.addEventListener('pointerleave', () => {
  if (getActiveModality(state) !== 'text') return;
  clearTextHighlight();
  clearVectorHighlight();
});

vectorList.addEventListener('click', (event) => {
  if (getActiveModality(state) !== 'text') return;
  const target = event.target as HTMLElement | null;
  const row = target?.closest<HTMLElement>('.vector-row.is-text');
  if (!row) return;
  const word = row.dataset.word;
  if (!word) return;
  const spans = activeTextWordSpans.get(word);
  const firstSpan = spans?.[0];
  if (firstSpan) {
    firstSpan.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
});

selectedTextContent.addEventListener('click', (event) => {
  if (getActiveModality(state) !== 'text') return;
  const target = event.target as HTMLElement | null;
  const wordEl = target?.closest<HTMLSpanElement>('.text-word');
  if (!wordEl) return;
  const word = wordEl.dataset.word;
  if (!word) return;
  const index = Number(wordEl.dataset.index);
  if (!Number.isFinite(index)) return;
  const vectorLength = state.meta?.vectorLength ?? 0;
  if (vectorLength <= 0) return;
  dispatch({ type: 'set-offset', offset: clampOffset(index, vectorLength) });
  const weight = activeTextWordWeights.get(word) ?? 0;
  if (weight > 0) {
    setTextHighlight(word, weight);
  }
});

selectedTextContent.addEventListener('pointerover', (event) => {
  if (getActiveModality(state) !== 'text') return;
  const target = event.target as HTMLElement | null;
  const wordEl = target?.closest<HTMLSpanElement>('.text-word');
  if (!wordEl) return;
  const word = wordEl.dataset.word;
  if (!word) return;
  const weight = activeTextWordWeights.get(word) ?? 0;
  setTextHighlight(word, weight);
});

selectedTextContent.addEventListener('pointerleave', () => {
  if (getActiveModality(state) !== 'text') return;
  clearTextHighlight();
  clearVectorHighlight();
});

datasetSelect.addEventListener('change', (event) => {
  const nextDataset = (event.target as HTMLSelectElement).value;
  if (!isDatasetOption(nextDataset, state.datasetOptions) || nextDataset === state.dataset) {
    datasetSelect.value = state.dataset;
    return;
  }

  dispatch({ type: 'dataset-change', dataset: nextDataset });
  void replaceSamples(state.targetSampleCount);
});

resampleBtn.addEventListener('click', () => {
  void replaceSamples(state.targetSampleCount);
});

function init() {
  dispatch({ type: 'load-start' });
  void (async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        const { width } = gridEl.getBoundingClientRect();
        updateLayoutFromGridSize(width, getGridTargetHeight(), { syncSamples: false });
        resolve();
      });
    });

    const catalog = await listDatasets();
    if (!catalog.ok) {
      dispatch({ type: 'load-error', message: catalog.error.message });
      return;
    }

    const datasetOptions: DatasetOption[] = catalog.value.datasets.map((dataset) => ({
      id: dataset.id,
      label: dataset.displayName || dataset.id,
      modality: dataset.modality,
    }));
    if (!datasetOptions.length) {
      dispatch({ type: 'load-error', message: 'No datasets available from backend.' });
      return;
    }

    let defaultDataset = catalog.value.defaultDataset;
    if (!isDatasetOption(defaultDataset, datasetOptions)) {
      defaultDataset = datasetOptions[0].id;
    }

    dispatch({
      type: 'catalog-success',
      dataset: defaultDataset,
      datasetOptions,
    });
    await replaceSamples(state.targetSampleCount);
  })();
}

init();
