import "./style.css";
import {
  MNIST_ENDPOINT,
  loadMnistSamples,
  toImageData,
  type MnistMeta,
  type MnistSample
} from "./lib/mnist";

const SAMPLE_COUNT = 24;
const VECTOR_WINDOW = 10;
const DEFAULT_IMAGE_SIZE = 28;

type AppStatus = "loading" | "ready" | "error";

type AppState = {
  status: AppStatus;
  meta: MnistMeta | null;
  samples: MnistSample[];
  selectedId: number | null;
  vectorOffset: number;
  error?: string;
};

type Action =
  | { type: "load-start" }
  | { type: "load-success"; meta: MnistMeta; samples: MnistSample[] }
  | { type: "load-error"; message: string }
  | { type: "samples-start" }
  | { type: "samples-success"; meta: MnistMeta; samples: MnistSample[] }
  | { type: "select"; id: number }
  | { type: "set-offset"; offset: number }
  | { type: "shift-offset"; delta: number };

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app element");

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
        <div class="meta-line">Dataset: MNIST API (backend)</div>
        <div class="meta-line">Sample size: <span id="sample-count">--</span></div>
        <button class="primary" id="resample" type="button">Draw new sample</button>
      </div>
    </header>

    <section class="layout">
      <div class="panel panel-grid">
        <div class="panel-header">
          <div>
            <h2>Image table</h2>
            <p class="panel-subtitle">Select a digit to reveal its vector.</p>
          </div>
          <div class="status-pill" id="status-pill">Loading MNIST data...</div>
        </div>
        <div
          class="mnist-grid is-loading"
          id="mnist-grid"
          role="grid"
          aria-label="MNIST sample grid"
        ></div>
      </div>

      <div class="panel panel-vector">
        <div class="panel-header">
          <div>
            <h2>Vector window</h2>
            <p class="panel-subtitle">10 components at a time.</p>
          </div>
          <div class="status-pill" id="selected-status">No selection</div>
        </div>

        <div class="selected-card">
          <canvas id="selected-canvas" width="28" height="28" aria-label="Selected digit"></canvas>
          <div class="selected-info">
            <div class="info-label">Selected index</div>
            <div class="info-value" id="selected-index">--</div>
            <div class="info-label">Vector length</div>
            <div class="info-value" id="vector-length">--</div>
            <div class="info-label">Window start</div>
            <div class="info-value" id="vector-start">0</div>
          </div>
        </div>

        <div class="vector-panel">
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
          <p class="hint">Scroll here or drag the slider to move through components.</p>
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

const statusPill = app.querySelector<HTMLDivElement>("#status-pill")!;
const selectedStatus = app.querySelector<HTMLDivElement>("#selected-status")!;
const gridEl = app.querySelector<HTMLDivElement>("#mnist-grid")!;
const resampleBtn = app.querySelector<HTMLButtonElement>("#resample")!;
const sampleCountEl = app.querySelector<HTMLSpanElement>("#sample-count")!;
const selectedCanvas = app.querySelector<HTMLCanvasElement>("#selected-canvas")!;
const selectedIndexEl = app.querySelector<HTMLDivElement>("#selected-index")!;
const vectorLengthEl = app.querySelector<HTMLDivElement>("#vector-length")!;
const vectorStartEl = app.querySelector<HTMLDivElement>("#vector-start")!;
const vectorRangeEl = app.querySelector<HTMLDivElement>("#vector-range")!;
const vectorSlider = app.querySelector<HTMLInputElement>("#vector-slider")!;
const vectorList = app.querySelector<HTMLDivElement>("#vector-list")!;
const debugStatus = app.querySelector<HTMLDivElement>("#debug-status")!;
const debugEndpoint = app.querySelector<HTMLDivElement>("#debug-endpoint")!;
const debugSource = app.querySelector<HTMLDivElement>("#debug-source")!;
const debugSplit = app.querySelector<HTMLDivElement>("#debug-split")!;
const debugSize = app.querySelector<HTMLDivElement>("#debug-size")!;
const debugTotal = app.querySelector<HTMLDivElement>("#debug-total")!;
const debugSamples = app.querySelector<HTMLDivElement>("#debug-samples")!;
const debugSelected = app.querySelector<HTMLDivElement>("#debug-selected")!;
const debugOffset = app.querySelector<HTMLDivElement>("#debug-offset")!;
const debugError = app.querySelector<HTMLPreElement>("#debug-error")!;

const outlineColor = getComputedStyle(document.documentElement)
  .getPropertyValue("--vector-outline")
  .trim() || "#f06449";

let state: AppState = {
  status: "loading",
  meta: null,
  samples: [],
  selectedId: null,
  vectorOffset: 0,
};

let lastSamples: MnistSample[] | null = null;

function clampOffset(offset: number, vectorLength: number): number {
  const maxOffset = Math.max(0, vectorLength - VECTOR_WINDOW);
  return Math.min(Math.max(offset, 0), maxOffset);
}

function getSelectedSample(current: AppState): MnistSample | null {
  if (current.selectedId === null) return null;
  return current.samples[current.selectedId] ?? null;
}

function reducer(current: AppState, action: Action): AppState {
  switch (action.type) {
    case "load-start":
      return { ...current, status: "loading", error: undefined };
    case "load-success":
      return {
        status: "ready",
        meta: action.meta,
        samples: action.samples,
        selectedId: action.samples.length ? 0 : null,
        vectorOffset: 0,
      };
    case "load-error":
      return { ...current, status: "error", error: action.message };
    case "samples-start":
      return { ...current, status: "loading", error: undefined };
    case "samples-success":
      return {
        ...current,
        status: "ready",
        meta: action.meta,
        samples: action.samples,
        selectedId: action.samples.length ? 0 : null,
        vectorOffset: 0,
      };
    case "select":
      return {
        ...current,
        selectedId: action.id,
        vectorOffset: 0,
      };
    case "set-offset": {
      const selected = getSelectedSample(current);
      if (!selected) return current;
      const nextOffset = clampOffset(action.offset, selected.vector.length);
      return { ...current, vectorOffset: nextOffset };
    }
    case "shift-offset": {
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

function renderGrid(samples: MnistSample[], selectedId: number | null, tileSize: number) {
  gridEl.textContent = "";
  const fragment = document.createDocumentFragment();

  samples.forEach((sample, i) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mnist-tile";
    button.dataset.sampleId = String(i);
    button.setAttribute("role", "gridcell");
    button.setAttribute("aria-pressed", i === selectedId ? "true" : "false");
    button.classList.toggle("is-selected", i === selectedId);
    button.setAttribute("aria-label", `MNIST index ${sample.index}`);
    button.style.setProperty("--i", String(i));

    const canvas = document.createElement("canvas");
    canvas.width = tileSize;
    canvas.height = tileSize;
    const ctx = canvas.getContext("2d");
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
  const buttons = gridEl.querySelectorAll<HTMLButtonElement>("[data-sample-id]");
  buttons.forEach((button) => {
    const id = Number(button.dataset.sampleId);
    button.setAttribute("aria-pressed", id === selectedId ? "true" : "false");
    button.classList.toggle("is-selected", id === selectedId);
  });
}

function getVectorWindowCells(
  offset: number,
  windowSize: number,
  vectorLength: number,
  rowSize: number
) {
  const clampedOffset = clampOffset(offset, vectorLength);
  const end = Math.min(vectorLength, clampedOffset + windowSize);
  const cells = new Set<string>();
  for (let i = clampedOffset; i < end; i += 1) {
    const row = Math.floor(i / rowSize);
    const col = i % rowSize;
    cells.add(`${row},${col}`);
  }
  return cells;
}

function drawVectorWindowOutline(
  ctx: CanvasRenderingContext2D,
  size: number,
  offset: number,
  windowSize: number,
  vectorLength: number
) {
  const cells = getVectorWindowCells(offset, windowSize, vectorLength, size);
  if (!cells.size) return;

  ctx.save();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 1;

  ctx.beginPath();
  cells.forEach((key) => {
    const [rowText, colText] = key.split(",");
    const row = Number(rowText);
    const col = Number(colText);
    const x = col;
    const y = row;

    // Draw only edges that border non-selected pixels.
    if (!cells.has(`${row - 1},${col}`)) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + 1, y);
    }
    if (!cells.has(`${row + 1},${col}`)) {
      ctx.moveTo(x, y + 1);
      ctx.lineTo(x + 1, y + 1);
    }
    if (!cells.has(`${row},${col - 1}`)) {
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 1);
    }
    if (!cells.has(`${row},${col + 1}`)) {
      ctx.moveTo(x + 1, y);
      ctx.lineTo(x + 1, y + 1);
    }
  });
  ctx.stroke();

  ctx.restore();
}

function renderSelected(sample: MnistSample | null, tileSize: number, offset: number) {
  if (selectedCanvas.width !== tileSize || selectedCanvas.height !== tileSize) {
    selectedCanvas.width = tileSize;
    selectedCanvas.height = tileSize;
  }

  const ctx = selectedCanvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;

  if (!sample) {
    ctx.clearRect(0, 0, selectedCanvas.width, selectedCanvas.height);
    selectedIndexEl.textContent = "--";
    selectedStatus.textContent = "No selection";
    return;
  }

  ctx.putImageData(toImageData(sample, tileSize), 0, 0);
  drawVectorWindowOutline(ctx, tileSize, offset, VECTOR_WINDOW, sample.vector.length);
  selectedIndexEl.textContent = String(sample.index);
  selectedStatus.textContent = `MNIST #${sample.index} (label ${sample.label})`;
}

function renderVector(sample: MnistSample | null, offset: number) {
  if (!sample) {
    vectorRangeEl.textContent = "Components --";
    vectorSlider.value = "0";
    vectorSlider.max = "0";
    vectorStartEl.textContent = "0";
    vectorList.innerHTML = `<div class="vector-empty">Select an image to view its vector.</div>`;
    return;
  }

  const vector = sample.vector;
  const clampedOffset = clampOffset(offset, vector.length);
  const end = Math.min(vector.length, clampedOffset + VECTOR_WINDOW);

  vectorRangeEl.textContent = `Components ${clampedOffset} - ${end - 1}`;
  vectorSlider.max = String(Math.max(0, vector.length - VECTOR_WINDOW));
  vectorSlider.value = String(clampedOffset);
  vectorStartEl.textContent = String(clampedOffset);

  vectorList.textContent = "";
  const fragment = document.createDocumentFragment();

  // Only render the active window to keep the DOM small and responsive.
  for (let i = clampedOffset; i < end; i += 1) {
    const value = vector[i];
    const row = document.createElement("div");
    row.className = "vector-row";

    const indexEl = document.createElement("div");
    indexEl.className = "vector-index";
    indexEl.textContent = String(i).padStart(3, "0");

    const valueEl = document.createElement("div");
    valueEl.className = "vector-value";
    valueEl.textContent = value.toFixed(3);

    const bar = document.createElement("div");
    bar.className = "vector-bar";
    bar.style.setProperty("--level", value.toFixed(4));

    row.appendChild(indexEl);
    row.appendChild(valueEl);
    row.appendChild(bar);
    fragment.appendChild(row);
  }

  vectorList.appendChild(fragment);
}

function renderDebug(current: AppState) {
  debugStatus.textContent = current.status;
  debugEndpoint.textContent = MNIST_ENDPOINT;
  debugSource.textContent = current.meta?.source ?? "--";
  debugSplit.textContent = current.meta?.split ?? "--";
  debugSize.textContent = current.meta ? `${current.meta.imageSize}x${current.meta.imageSize}` : "--";
  debugTotal.textContent = current.meta ? String(current.meta.totalCount) : "--";
  debugSamples.textContent = String(current.samples.length);
  debugSelected.textContent = current.selectedId !== null ? String(current.selectedId) : "--";
  debugOffset.textContent = String(current.vectorOffset);
  debugError.textContent = current.error ?? "--";
}

function render(current: AppState) {
  sampleCountEl.textContent = String(SAMPLE_COUNT);
  resampleBtn.disabled = !current.meta || current.status === "loading";

  if (current.status === "loading" && !current.meta) {
    statusPill.textContent = "Loading MNIST data...";
  } else if (current.status === "loading") {
    statusPill.textContent = "Sampling images...";
  } else if (current.status === "error") {
    statusPill.textContent = current.error ?? "Failed to load MNIST.";
  } else {
    statusPill.textContent = "Pick a digit";
  }

  const tileSize = current.meta?.imageSize ?? DEFAULT_IMAGE_SIZE;
  const vectorLength = tileSize * tileSize;
  vectorLengthEl.textContent = current.meta ? String(vectorLength) : "--";

  gridEl.classList.toggle("is-loading", current.status === "loading" && !current.samples.length);

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

async function fetchSamples() {
  return loadMnistSamples(SAMPLE_COUNT);
}

gridEl.addEventListener("click", (event) => {
  const target = event.target as HTMLElement | null;
  const button = target?.closest<HTMLButtonElement>("[data-sample-id]");
  if (!button) return;
  const id = Number(button.dataset.sampleId);
  if (Number.isNaN(id)) return;
  dispatch({ type: "select", id });
});

vectorSlider.addEventListener("input", (event) => {
  const nextOffset = Number((event.target as HTMLInputElement).value);
  dispatch({ type: "set-offset", offset: nextOffset });
});

vectorList.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    const delta = Math.sign(event.deltaY);
    if (delta !== 0) {
      dispatch({ type: "shift-offset", delta });
    }
  },
  { passive: false }
);

vectorList.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    dispatch({ type: "shift-offset", delta: 1 });
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    dispatch({ type: "shift-offset", delta: -1 });
  } else if (event.key === "PageDown") {
    event.preventDefault();
    dispatch({ type: "shift-offset", delta: VECTOR_WINDOW });
  } else if (event.key === "PageUp") {
    event.preventDefault();
    dispatch({ type: "shift-offset", delta: -VECTOR_WINDOW });
  } else if (event.key === "Home") {
    event.preventDefault();
    dispatch({ type: "set-offset", offset: 0 });
  } else if (event.key === "End") {
    event.preventDefault();
    const selected = getSelectedSample(state);
    if (!selected) return;
    dispatch({
      type: "set-offset",
      offset: Math.max(0, selected.vector.length - VECTOR_WINDOW),
    });
  }
});

resampleBtn.addEventListener("click", async () => {
  dispatch({ type: "samples-start" });
  const result = await fetchSamples();
  if (!result.ok) {
    dispatch({ type: "load-error", message: result.error.message });
    return;
  }
  dispatch({ type: "samples-success", meta: result.value.meta, samples: result.value.samples });
});

async function init() {
  dispatch({ type: "load-start" });
  const result = await fetchSamples();
  if (!result.ok) {
    dispatch({ type: "load-error", message: result.error.message });
    return;
  }
  dispatch({ type: "load-success", meta: result.value.meta, samples: result.value.samples });
}

init();
