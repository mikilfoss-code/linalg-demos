import '@shared/ui/base-shell.css';
import './style.css';
import {
  renderLayoutPlan,
  type LayoutRendererRegistry,
} from '@shared/lib/layout-renderer';
import { applyLayoutTokens } from '@shared/lib/layout-runtime';
import { ACTIVE_MATRIX_LAYOUT_PROFILE, type MatrixPanelId } from './layout-options';
import { getApiBaseUrl, health } from './lib/api';

const API_BASE = getApiBaseUrl() || '(same origin)';

const el = document.querySelector<HTMLDivElement>('#app');
if (!el) throw new Error('Missing #app element');

el.innerHTML = `
  <div class="base-shell">
    <header class="base-header">
      <div>
        <h1 class="base-title">Matrix Transforms</h1>
        <p class="base-subtitle">
          Explore how matrices act on vectors. More controls coming soon.
        </p>
      </div>
    </header>
    <section
      class="base-layout ${ACTIVE_MATRIX_LAYOUT_PROFILE.containerModeClassName}"
      id="matrix-layout-root"
    ></section>
  </div>
`;

const baseShell = requireElement<HTMLDivElement>(el, '.base-shell');
applyLayoutTokens(baseShell, ACTIVE_MATRIX_LAYOUT_PROFILE.tokens);

const matrixPanelRegistry: LayoutRendererRegistry<MatrixPanelId> = {
  byPanelId: {
    controls: () => {
      return createTemplateElement<HTMLElement>(`
        <section class="base-panel base-layout-panel base-layout-panel-controls">
          <h2 class="base-panel-title">Controls</h2>
          <p class="base-subtitle">
            API base: <code>${API_BASE}</code>
          </p>
          <div class="base-actions">
            <button class="base-button" id="btn">Check backend /health</button>
          </div>
        </section>
      `);
    },
    output: () => {
      return createTemplateElement<HTMLElement>(`
        <section class="base-panel base-layout-panel base-layout-panel-output">
          <h2 class="base-panel-title">Health response</h2>
          <pre class="base-output" id="out" aria-live="polite"></pre>
        </section>
      `);
    },
  },
};

const layoutRoot = requireElement<HTMLDivElement>(el, '#matrix-layout-root');
renderLayoutPlan({
  container: layoutRoot,
  plan: ACTIVE_MATRIX_LAYOUT_PROFILE.renderPlan,
  registry: matrixPanelRegistry,
});

const out = requireElement<HTMLPreElement>(el, '#out');
const btn = requireElement<HTMLButtonElement>(el, '#btn');

btn.addEventListener('click', async () => {
  out.textContent = 'Loading…';
  const result = await health();
  if (!result.ok) {
    out.textContent = `Error: ${result.error.message}`;
    return;
  }
  out.textContent = JSON.stringify(result.value, null, 2);
});

/**
 * Purpose: createTemplateElement function.
 * Inputs: Parameters declared in the function signature.
 * Returns: The value produced by this function.
 * Side effects: May update local state, shared state, or the DOM when applicable.
 */
function createTemplateElement<T extends HTMLElement>(markup: string): T {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  const node = template.content.firstElementChild;
  if (!(node instanceof HTMLElement)) {
    throw new Error('Layout renderer must return a single root HTMLElement.');
  }
  return node as T;
}

/**
 * Purpose: requireElement function.
 * Inputs: Parameters declared in the function signature.
 * Returns: The value produced by this function.
 * Side effects: May update local state, shared state, or the DOM when applicable.
 */
function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}
