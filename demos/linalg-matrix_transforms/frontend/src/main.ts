import '@shared/ui/base-shell.css';
import './style.css';
import {
  type LayoutRendererRegistry,
} from '@shared/lib/layout-renderer';
import { mountResponsiveLayout } from '@shared/lib/layout-runtime';
import { createTemplateElement, requireElement } from '@shared/lib/dom';
import {
  MATRIX_FALLBACK_VARIANTS,
  MATRIX_LAYOUT_MODE,
  MATRIX_LAYOUT_SCHEMA,
  type MatrixPanelId,
} from './layout-options';
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
      class="base-layout"
      id="matrix-layout-root"
    ></section>
  </div>
`;

const baseShell = requireElement<HTMLDivElement>(el, '.base-shell');

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
mountResponsiveLayout({
  container: layoutRoot,
  tokenTarget: baseShell,
  schema: MATRIX_LAYOUT_SCHEMA,
  preferredVariantId: MATRIX_LAYOUT_MODE,
  fallbackVariant: MATRIX_FALLBACK_VARIANTS[MATRIX_LAYOUT_MODE],
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
