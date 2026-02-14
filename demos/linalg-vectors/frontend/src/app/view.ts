import {
  renderLayoutPlan,
  type LayoutNodeRenderOutput,
  type LayoutRendererRegistry,
} from '@shared/lib/layout-renderer';
import {
  applyLayoutTokens,
  placementToInlineStyle,
  type ResolvedLayoutProfile,
} from '@shared/lib/layout-runtime';
import {
  ACTIVE_VECTORS_LAYOUT_PROFILE,
  INCLUDE_DEBUG_PANEL,
  type VectorsPanelId,
} from './layout-options';

/**
 * Internal migration toggle.
 * Keep `true` for recursive layout rendering. Set `false` for the legacy flat template.
 */
const USE_RECURSIVE_LAYOUT_ENGINE = true;

export type DebugView = {
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
  debug?: DebugView;
};

/**
 * Build vectors app markup with profile-driven panel ordering.
 *
 * @param layoutProfile - Selected layout profile strategy.
 * @param includeDebugPanel - Whether debug panel should be rendered.
 * @returns App HTML template string.
 */
function createLegacyAppTemplate(
  layoutProfile: ResolvedLayoutProfile<VectorsPanelId>,
  includeDebugPanel: boolean
) {
  const panels = [
    createLegacyVectorPanel(layoutProfile),
    createLegacyGridPanel(layoutProfile),
    includeDebugPanel ? createLegacyDebugPanel(layoutProfile) : '',
  ]
    .filter(Boolean)
    .join('\n');

  return `
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

    <section class="layout ${layoutProfile.containerModeClassName}">
${panels}
    </section>
  </main>
`;
}

function createRecursiveShellTemplate(
  layoutProfile: ResolvedLayoutProfile<VectorsPanelId>
): string {
  return `
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

    <section
      class="layout ${layoutProfile.containerModeClassName}"
      id="vectors-layout-root"
    ></section>
  </main>
`;
}

function createLegacyGridPanel(layoutProfile: ResolvedLayoutProfile<VectorsPanelId>): string {
  const panelStyle = placementToInlineStyle(layoutProfile.placementOf('grid'));
  return `
      <div class="layout-panel layout-panel-grid panel panel-grid" style="${panelStyle}">
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
`;
}

function createLegacyVectorPanel(layoutProfile: ResolvedLayoutProfile<VectorsPanelId>): string {
  const panelStyle = placementToInlineStyle(layoutProfile.placementOf('vector'));
  return `
      <div class="layout-panel layout-panel-vector panel panel-vector" style="${panelStyle}">
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
`;
}

function createLegacyDebugPanel(layoutProfile: ResolvedLayoutProfile<VectorsPanelId>): string {
  const panelStyle = placementToInlineStyle(layoutProfile.placementOf('debug'));
  return `
      <section
        class="layout-panel layout-panel-debug panel panel-debug"
        style="${panelStyle}"
        aria-live="polite"
      >
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
`;
}

function createTemplateElement<T extends HTMLElement>(markup: string): T {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  const node = template.content.firstElementChild;
  if (!(node instanceof HTMLElement)) {
    throw new Error('Panel renderer must return a single root HTMLElement.');
  }
  return node as T;
}

function createGridPanelNode(): HTMLElement {
  return createTemplateElement<HTMLDivElement>(`
    <div class="layout-panel layout-panel-grid panel panel-grid">
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
  `);
}

function createVectorPanelNode(): LayoutNodeRenderOutput {
  const element = createTemplateElement<HTMLDivElement>(`
    <div class="layout-panel layout-panel-vector panel panel-vector">
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
        <div class="vector-shell"></div>
        <p class="hint hint-vector">Scroll or drag the slider to move through vector components.</p>
      </div>
    </div>
  `);

  return {
    element,
    childContainer: requireElement<HTMLDivElement>(element, '.vector-shell'),
  };
}

function createSelectedPanelNode(): HTMLElement {
  return createTemplateElement<HTMLDivElement>(`
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
  `);
}

function createVectorWindowPanelNode(): LayoutNodeRenderOutput {
  const element = createTemplateElement<HTMLDivElement>(`
    <div class="vector-content">
      <div class="vector-controls">
        <div class="vector-range" id="vector-range">Components --</div>
      </div>
      <div class="vector-body"></div>
    </div>
  `);

  return {
    element,
    childContainer: requireElement<HTMLDivElement>(element, '.vector-body'),
  };
}

function createSliderPanelNode(): HTMLElement {
  return createTemplateElement<HTMLInputElement>(`
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
  `);
}

function createComponentsPanelNode(): HTMLElement {
  return createTemplateElement<HTMLDivElement>(`
    <div
      class="vector-list"
      id="vector-list"
      tabindex="0"
      aria-label="Vector component window"
    ></div>
  `);
}

function createDebugPanelNode(): HTMLElement {
  return createTemplateElement<HTMLElement>(`
    <section class="layout-panel layout-panel-debug panel panel-debug" aria-live="polite">
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
  `);
}

const vectorsRendererRegistry: LayoutRendererRegistry<VectorsPanelId> = {
  byPanelId: {
    grid: createGridPanelNode,
    vector: createVectorPanelNode,
    selected: createSelectedPanelNode,
    vectorWindow: createVectorWindowPanelNode,
    slider: createSliderPanelNode,
    components: createComponentsPanelNode,
    debug: createDebugPanelNode,
  },
};

/**
 * Query a required element and throw early if missing.
 *
 * @param root - Root node used for query selection.
 * @param selector - CSS selector for required element.
 * @returns Matching element typed as `T`.
 * @throws Error when selector does not match an element.
 */
function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

/**
 * Build and bind the vectors app view template.
 *
 * @param rootSelector - Selector for root mount element.
 * @returns Typed object containing required DOM references for the app.
 * @throws Error when root mount element is missing.
 */
export function createAppView(rootSelector = '#app'): AppView {
  const app = document.querySelector<HTMLDivElement>(rootSelector);
  if (!app) {
    throw new Error(`Missing ${rootSelector} element`);
  }

  if (USE_RECURSIVE_LAYOUT_ENGINE) {
    app.innerHTML = createRecursiveShellTemplate(ACTIVE_VECTORS_LAYOUT_PROFILE);
    const layoutRoot = requireElement<HTMLDivElement>(app, '#vectors-layout-root');
    renderLayoutPlan({
      container: layoutRoot,
      plan: ACTIVE_VECTORS_LAYOUT_PROFILE.renderPlan,
      registry: vectorsRendererRegistry,
      shouldRenderPanel: ({ panelId }) => INCLUDE_DEBUG_PANEL || panelId !== 'debug',
    });
  } else {
    app.innerHTML = createLegacyAppTemplate(
      ACTIVE_VECTORS_LAYOUT_PROFILE,
      INCLUDE_DEBUG_PANEL
    );
  }

  applyLayoutTokens(app, ACTIVE_VECTORS_LAYOUT_PROFILE.tokens);

  const selectedBuffer = document.createElement('canvas');
  const selectedBufferCtx = selectedBuffer.getContext('2d');
  const debugRoot = app.querySelector<HTMLElement>('.layout-panel-debug');

  const view: AppView = {
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
  };

  if (debugRoot) {
    view.debug = {
      debugStatus: requireElement<HTMLDivElement>(debugRoot, '#debug-status'),
      debugEndpoint: requireElement<HTMLDivElement>(debugRoot, '#debug-endpoint'),
      debugSource: requireElement<HTMLDivElement>(debugRoot, '#debug-source'),
      debugSplit: requireElement<HTMLDivElement>(debugRoot, '#debug-split'),
      debugSizeLabel: requireElement<HTMLDivElement>(debugRoot, '#debug-size-label'),
      debugSize: requireElement<HTMLDivElement>(debugRoot, '#debug-size'),
      debugTotal: requireElement<HTMLDivElement>(debugRoot, '#debug-total'),
      debugSamples: requireElement<HTMLDivElement>(debugRoot, '#debug-samples'),
      debugSelected: requireElement<HTMLDivElement>(debugRoot, '#debug-selected'),
      debugOffset: requireElement<HTMLDivElement>(debugRoot, '#debug-offset'),
      debugError: requireElement<HTMLPreElement>(debugRoot, '#debug-error'),
    };
  }

  return view;
}
