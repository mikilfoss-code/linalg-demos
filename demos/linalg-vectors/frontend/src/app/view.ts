export type AppView = {
  app: HTMLDivElement;
  statusPill: HTMLDivElement;
  gridTitle: HTMLHeadingElement;
  gridSubtitle: HTMLParagraphElement;
  selectedStatus: HTMLDivElement;
  gridEl: HTMLDivElement;
  vectorPanel: HTMLDivElement;
  vectorTitle: HTMLHeadingElement;
  vectorSubtitleLeading: HTMLSpanElement;
  datasetSelect: HTMLSelectElement;
  datasetNameEl: HTMLSpanElement;
  resampleBtn: HTMLButtonElement;
  sampleCountEl: HTMLSpanElement;
  selectedCard: HTMLDivElement;
  selectedCanvas: HTMLCanvasElement;
  selectedText: HTMLDivElement;
  selectedTextContent: HTMLDivElement;
  selectedBuffer: HTMLCanvasElement;
  selectedBufferCtx: CanvasRenderingContext2D | null;
  vectorLengthEl: HTMLDivElement;
  vectorRangeEl: HTMLDivElement;
  vectorSlider: HTMLInputElement;
  vectorList: HTMLDivElement;
  debugStatus: HTMLDivElement;
  debugEndpoint: HTMLDivElement;
  debugSource: HTMLDivElement;
  debugSplit: HTMLDivElement;
  debugSizeLabel: HTMLDivElement;
  debugSize: HTMLDivElement;
  debugTotal: HTMLDivElement;
  debugSamples: HTMLDivElement;
  debugSelected: HTMLDivElement;
  debugOffset: HTMLDivElement;
  debugError: HTMLPreElement;
};

const APP_TEMPLATE = `
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

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

export function createAppView(rootSelector = '#app'): AppView {
  const app = document.querySelector<HTMLDivElement>(rootSelector);
  if (!app) {
    throw new Error(`Missing ${rootSelector} element`);
  }
  app.innerHTML = APP_TEMPLATE;

  const selectedBuffer = document.createElement('canvas');
  const selectedBufferCtx = selectedBuffer.getContext('2d');

  return {
    app,
    statusPill: requireElement<HTMLDivElement>(app, '#status-pill'),
    gridTitle: requireElement<HTMLHeadingElement>(app, '#grid-title'),
    gridSubtitle: requireElement<HTMLParagraphElement>(app, '#grid-subtitle'),
    selectedStatus: requireElement<HTMLDivElement>(app, '#selected-status'),
    gridEl: requireElement<HTMLDivElement>(app, '#mnist-grid'),
    vectorPanel: requireElement<HTMLDivElement>(app, '.vector-panel'),
    vectorTitle: requireElement<HTMLHeadingElement>(app, '#vector-title'),
    vectorSubtitleLeading: requireElement<HTMLSpanElement>(app, '#vector-subtitle-leading'),
    datasetSelect: requireElement<HTMLSelectElement>(app, '#dataset-select'),
    datasetNameEl: requireElement<HTMLSpanElement>(app, '#dataset-name'),
    resampleBtn: requireElement<HTMLButtonElement>(app, '#resample'),
    sampleCountEl: requireElement<HTMLSpanElement>(app, '#sample-count'),
    selectedCard: requireElement<HTMLDivElement>(app, '.selected-card'),
    selectedCanvas: requireElement<HTMLCanvasElement>(app, '#selected-canvas'),
    selectedText: requireElement<HTMLDivElement>(app, '#selected-text'),
    selectedTextContent: requireElement<HTMLDivElement>(app, '#selected-text-content'),
    selectedBuffer,
    selectedBufferCtx,
    vectorLengthEl: requireElement<HTMLDivElement>(app, '#vector-length'),
    vectorRangeEl: requireElement<HTMLDivElement>(app, '#vector-range'),
    vectorSlider: requireElement<HTMLInputElement>(app, '#vector-slider'),
    vectorList: requireElement<HTMLDivElement>(app, '#vector-list'),
    debugStatus: requireElement<HTMLDivElement>(app, '#debug-status'),
    debugEndpoint: requireElement<HTMLDivElement>(app, '#debug-endpoint'),
    debugSource: requireElement<HTMLDivElement>(app, '#debug-source'),
    debugSplit: requireElement<HTMLDivElement>(app, '#debug-split'),
    debugSizeLabel: requireElement<HTMLDivElement>(app, '#debug-size-label'),
    debugSize: requireElement<HTMLDivElement>(app, '#debug-size'),
    debugTotal: requireElement<HTMLDivElement>(app, '#debug-total'),
    debugSamples: requireElement<HTMLDivElement>(app, '#debug-samples'),
    debugSelected: requireElement<HTMLDivElement>(app, '#debug-selected'),
    debugOffset: requireElement<HTMLDivElement>(app, '#debug-offset'),
    debugError: requireElement<HTMLPreElement>(app, '#debug-error'),
  };
}
