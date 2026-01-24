import './style.css';
import {
  MNIST_ENDPOINT,
  loadMnistSamples,
  toImageData,
  type MnistMeta,
  type MnistSample,
} from './lib/mnist';

type GridLayout = { columns: number; rows: number };

const VECTOR_WINDOW = 10;
const DEFAULT_IMAGE_SIZE = 28;

type AppStatus = 'loading' | 'ready' | 'error';

type AppState = {
  status: AppStatus;
  meta: MnistMeta | null;
  samples: MnistSample[];
  selectedId: number | null;
  vectorOffset: number;
  gridLayout: GridLayout;
  targetSampleCount: number;
  error?: string;
};

type Action =
  | { type: 'load-start' }
  | { type: 'load-success'; meta: MnistMeta; samples: MnistSample[] }
  | { type: 'load-error'; message: string }
  | { type: 'samples-start' }
  | { type: 'samples-success'; meta: MnistMeta; samples: MnistSample[] }
  | { type: 'samples-append'; meta: MnistMeta; samples: MnistSample[] }
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
        <h1>MNIST Vector Explorer</h1>
        <p class="subtitle">
          Pick a handwritten digit and inspect its 784-dimensional vector.
          Scroll through 10 consecutive components at a time.
        </p>
      </div>
      <div class="hero-card">
        <div class="meta-line">Dataset: MNIST</div>
        <div class="meta-line">Sample size: <span id="sample-count">--</span></div>
      </div>
    </header>

    <section class="layout">
      <div class="panel panel-grid">
        <div class="panel-header">
          <div>
            <h2>Image table</h2>
            <p class="panel-subtitle">Select an image</p>
          </div>
          <div class="status-pill" id="status-pill">Loading MNIST data...</div>
        </div>
        <div
          class="mnist-grid is-loading"
          id="mnist-grid"
          role="grid"
          aria-label="MNIST sample grid"
        ></div>
        <div class="panel-footer">
          <button class="primary" id="resample" type="button">Draw new sample</button>
        </div>
      </div>

      <div class="panel panel-vector">
        <div class="panel-header">
          <div>
            <h2>Vector window</h2>
            <p class="panel-subtitle">10 components at a time
            <span aria-hidden="true">&middot;</span>
            dimension: <span id="vector-length">--</span>
            </p>
          </div>
          <div class="status-pill" id="selected-status">No selection</div>
        </div>

        <div class="vector-panel">
          <div class="vector-shell">
            <div class="selected-card">
              <canvas id="selected-canvas" width="28" height="28" aria-label="Selected digit"></canvas>
              <!-- <div class="selected-info">
                <div class="info-label">Selected index</div>
                <div class="info-value" id="selected-index">--</div>
                <div class="info-label">Vector length</div>
                <div class="info-value" id="vector-length">--</div>
                <div class="info-label">Window start</div>
                <div class="info-value" id="vector-start">0</div>
              </div> -->
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
          <div class="debug-label">Image size</div>
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
const selectedStatus = app.querySelector<HTMLDivElement>('#selected-status')!;
const gridEl = app.querySelector<HTMLDivElement>('#mnist-grid')!;
const resampleBtn = app.querySelector<HTMLButtonElement>('#resample')!;
const sampleCountEl = app.querySelector<HTMLSpanElement>('#sample-count')!;
const selectedCanvas = app.querySelector<HTMLCanvasElement>('#selected-canvas')!;
// Offscreen buffer keeps ImageData scaling crisp without relying on CSS scaling.
const selectedBuffer = document.createElement('canvas');
const selectedBufferCtx = selectedBuffer.getContext('2d');
// const selectedIndexEl = app.querySelector<HTMLDivElement>("#selected-index")!;
const vectorLengthEl = app.querySelector<HTMLDivElement>('#vector-length')!;
// const vectorStartEl = app.querySelector<HTMLDivElement>("#vector-start")!;
const vectorRangeEl = app.querySelector<HTMLDivElement>('#vector-range')!;
const vectorSlider = app.querySelector<HTMLInputElement>('#vector-slider')!;
const vectorList = app.querySelector<HTMLDivElement>('#vector-list')!;
const debugStatus = app.querySelector<HTMLDivElement>('#debug-status')!;
const debugEndpoint = app.querySelector<HTMLDivElement>('#debug-endpoint')!;
const debugSource = app.querySelector<HTMLDivElement>('#debug-source')!;
const debugSplit = app.querySelector<HTMLDivElement>('#debug-split')!;
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

let state: AppState = {
  status: 'loading',
  meta: null,
  samples: [],
  selectedId: null,
  vectorOffset: 0,
  gridLayout: FALLBACK_GRID_LAYOUT,
  targetSampleCount: FALLBACK_GRID_LAYOUT.columns * FALLBACK_GRID_LAYOUT.rows,
};

let lastSamples: MnistSample[] | null = null;
let sampleRequestId = 0;
let isSampling = false;

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

function getCanvasContentSize(canvas: HTMLCanvasElement, fallback: number): number {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return fallback;
  }
  const styles = getComputedStyle(canvas);
  const paddingX = parsePixelValue(styles.paddingLeft) + parsePixelValue(styles.paddingRight);
  const paddingY = parsePixelValue(styles.paddingTop) + parsePixelValue(styles.paddingBottom);
  const contentWidth = Math.max(0, rect.width - paddingX);
  const contentHeight = Math.max(0, rect.height - paddingY);
  return Math.max(1, Math.min(contentWidth, contentHeight));
}

function syncCanvasToDisplay(
  canvas: HTMLCanvasElement,
  fallback: number
): { size: number; scale: number } {
  const size = getCanvasContentSize(canvas, fallback);
  const scale = window.devicePixelRatio || 1;
  const pixelSize = Math.max(1, Math.round(size * scale));

  // Match the canvas backing store to its CSS size so 1px strokes stay 1px.
  if (canvas.width !== pixelSize || canvas.height !== pixelSize) {
    canvas.width = pixelSize;
    canvas.height = pixelSize;
  }

  return { size: canvas.width / scale, scale };
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
  rowGap: number
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

  let rowSize = computeRowSize(width, columns, columnGap);
  let rows = computeRowCount(height, rowSize, rowGap);
  let layout = clampGridLayout({ columns, rows });

  // If max-sample clamping reduces columns, recompute row sizing.
  if (layout.columns !== columns) {
    rowSize = computeRowSize(width, layout.columns, columnGap);
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

function getSelectedSample(current: AppState): MnistSample | null {
  if (current.selectedId === null) return null;
  return current.samples[current.selectedId] ?? null;
}

function reducer(current: AppState, action: Action): AppState {
  switch (action.type) {
    case 'load-start':
      return { ...current, status: 'loading', error: undefined };
    case 'load-success':
      return {
        status: 'ready',
        meta: action.meta,
        samples: action.samples,
        selectedId: action.samples.length ? 0 : null,
        vectorOffset: 0,
        gridLayout: current.gridLayout,
        targetSampleCount: current.targetSampleCount,
      };
    case 'load-error':
      return { ...current, status: 'error', error: action.message };
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
      if (!selected) return current;
      const nextOffset = clampOffset(action.offset, selected.vector.length);
      return { ...current, vectorOffset: nextOffset };
    }
    case 'shift-offset': {
      const selected = getSelectedSample(current);
      if (!selected) return current;
      const nextOffset = clampOffset(current.vectorOffset + action.delta, selected.vector.length);
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
  const requestId = nextSampleRequestId();
  dispatch({ type: 'samples-start' });
  const result = await loadMnistSamples(missingCount);
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
  const requestId = nextSampleRequestId();
  dispatch({ type: 'samples-start' });
  const result = await loadMnistSamples(count);
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
  // Keep rows square with columns so vertical gaps don't stretch with panel height.
  gridEl.style.setProperty('--grid-row-size', `${rowSize}px`);
}

function updateLayoutFromGridSize(
  width: number,
  height: number,
  options: { syncSamples?: boolean } = {}
) {
  if (width <= 0 || height <= 0) return;
  const { columnGap, rowGap } = getGridGaps();
  const { layout, rowSize } = computeGridLayout(width, height, columnGap, rowGap);
  setGridRowSize(rowSize);
  updateGridLayout(layout, options);
}

function renderGrid(samples: MnistSample[], selectedId: number | null, tileSize: number) {
  gridEl.textContent = '';
  const fragment = document.createDocumentFragment();

  samples.forEach((sample, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mnist-tile';
    button.dataset.sampleId = String(i);
    button.setAttribute('role', 'gridcell');
    button.setAttribute('aria-pressed', i === selectedId ? 'true' : 'false');
    button.classList.toggle('is-selected', i === selectedId);
    button.setAttribute('aria-label', `MNIST index ${sample.index}`);
    button.style.setProperty('--i', String(i));

    const canvas = document.createElement('canvas');
    canvas.width = tileSize;
    canvas.height = tileSize;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      ctx.putImageData(toImageData(sample, tileSize), 0, 0);
    }

    button.appendChild(canvas);
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
  imageSize: number,
  displaySize: number,
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

  const cellSize = displaySize / imageSize;
  if (!Number.isFinite(cellSize) || cellSize <= 0) {
    ctx.restore();
    return;
  }

  const startRow = Math.floor(start / imageSize);
  const startCol = start % imageSize;
  const endIndex = endExclusive - 1;
  const endRow = Math.floor(endIndex / imageSize);
  const endCol = endIndex % imageSize;

  const drawRowOutline = (row: number, colStart: number, colEnd: number) => {
    if (colEnd < colStart) return;
    const width = (colEnd - colStart + 1) * cellSize;
    const height = cellSize;
    const x = colStart * cellSize;
    const y = row * cellSize;
    // Keep the 1px stroke inside the row bounds for a crisp outline.
    ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, width - 1), Math.max(0, height - 1));
  };

  if (startRow === endRow) {
    drawRowOutline(startRow, startCol, endCol);
  } else {
    drawRowOutline(startRow, startCol, imageSize - 1);
    for (let row = startRow + 1; row < endRow; row += 1) {
      drawRowOutline(row, 0, imageSize - 1);
    }
    drawRowOutline(endRow, 0, endCol);
  }

  ctx.restore();
}

function renderSelected(sample: MnistSample | null, tileSize: number, offset: number) {
  const ctx = selectedCanvas.getContext('2d');
  if (!ctx) return;
  const { size: displaySize, scale } = syncCanvasToDisplay(selectedCanvas, tileSize);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, displaySize, displaySize);

  if (!sample) {
    // selectedIndexEl.textContent = "--";
    selectedStatus.textContent = 'No selection';
    return;
  }

  if (selectedBufferCtx) {
    if (selectedBuffer.width !== tileSize || selectedBuffer.height !== tileSize) {
      selectedBuffer.width = tileSize;
      selectedBuffer.height = tileSize;
    }
    selectedBufferCtx.putImageData(toImageData(sample, tileSize), 0, 0);
    ctx.drawImage(selectedBuffer, 0, 0, displaySize, displaySize);
  } else {
    ctx.putImageData(toImageData(sample, tileSize), 0, 0);
  }

  drawVectorWindowOutline(ctx, tileSize, displaySize, offset, VECTOR_WINDOW, sample.vector.length);
  // selectedIndexEl.textContent = String(sample.index);
  selectedStatus.textContent = `MNIST #${sample.index} (label ${sample.label})`;
}

function renderVector(sample: MnistSample | null, offset: number) {
  if (!sample) {
    vectorRangeEl.textContent = 'Components --';
    vectorSlider.value = '0';
    vectorSlider.max = '0';
    // vectorStartEl.textContent = "0";
    vectorList.innerHTML = `<div class="vector-empty">Select an image to view its vector.</div>`;
    return;
  }

  const vector = sample.vector;
  const clampedOffset = clampOffset(offset, vector.length);
  const end = Math.min(vector.length, clampedOffset + VECTOR_WINDOW);
  const sliderMax = getSliderMax(vector.length);

  vectorRangeEl.textContent = `Components ${clampedOffset + 1} - ${end}`;
  vectorSlider.max = String(sliderMax);
  vectorSlider.value = String(offsetToSliderValue(clampedOffset, sliderMax));
  // vectorStartEl.textContent = String(clampedOffset);

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

function renderDebug(current: AppState) {
  debugStatus.textContent = current.status;
  debugEndpoint.textContent = MNIST_ENDPOINT;
  debugSource.textContent = current.meta?.source ?? '--';
  debugSplit.textContent = current.meta?.split ?? '--';
  debugSize.textContent = current.meta
    ? `${current.meta.imageSize}x${current.meta.imageSize}`
    : '--';
  debugTotal.textContent = current.meta ? String(current.meta.totalCount) : '--';
  debugSamples.textContent = String(current.samples.length);
  debugSelected.textContent = current.selectedId !== null ? String(current.selectedId) : '--';
  debugOffset.textContent = String(current.vectorOffset);
  debugError.textContent = current.error ?? '--';
}

function render(current: AppState) {
  sampleCountEl.textContent = String(current.targetSampleCount);
  resampleBtn.disabled = !current.meta || current.status === 'loading';

  if (current.status === 'loading' && !current.meta) {
    statusPill.hidden = false;
    statusPill.textContent = 'Loading MNIST data...';
  } else if (current.status === 'loading') {
    statusPill.hidden = false;
    statusPill.textContent = 'Sampling images...';
  } else if (current.status === 'error') {
    statusPill.hidden = false;
    statusPill.textContent = current.error ?? 'Failed to load MNIST.';
  } else {
    statusPill.hidden = true;
    statusPill.textContent = '';
  }

  const tileSize = current.meta?.imageSize ?? DEFAULT_IMAGE_SIZE;
  const vectorLength = tileSize * tileSize;
  vectorLengthEl.textContent = current.meta ? String(vectorLength) : '--';

  gridEl.classList.toggle('is-loading', current.status === 'loading' && !current.samples.length);

  if (current.samples !== lastSamples) {
    renderGrid(current.samples, current.selectedId, tileSize);
    lastSamples = current.samples;
  } else {
    updateGridSelection(current.selectedId);
  }

  const selectedSample = getSelectedSample(current);
  renderSelected(selectedSample, tileSize, current.vectorOffset);
  renderVector(selectedSample, current.vectorOffset);
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
  if (!selected) return;
  const rawValue = Number((event.target as HTMLInputElement).value);
  const sliderMax = Number(vectorSlider.max) || 0;
  const nextOffset = clampOffset(sliderValueToOffset(rawValue, sliderMax), selected.vector.length);
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
    if (!selected) return;
    dispatch({
      type: 'set-offset',
      offset: Math.max(0, selected.vector.length - VECTOR_WINDOW),
    });
  }
});

resampleBtn.addEventListener('click', () => {
  void replaceSamples(state.targetSampleCount);
});

function init() {
  dispatch({ type: 'load-start' });
  requestAnimationFrame(() => {
    const { width } = gridEl.getBoundingClientRect();
    updateLayoutFromGridSize(width, getGridTargetHeight(), { syncSamples: false });
    void replaceSamples(state.targetSampleCount);
  });
}

init();
