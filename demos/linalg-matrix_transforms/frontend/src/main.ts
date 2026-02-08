import "@shared/ui/demo-shell.css";
import "./style.css";
import { getApiBaseUrl, health } from "./lib/api";
import { ACTIVE_MATRIX_LAYOUT_PROFILE } from "./layout-options";

const API_BASE = getApiBaseUrl() || "(same origin)";

const el = document.querySelector<HTMLDivElement>("#app");
if (!el) throw new Error("Missing #app element");

el.innerHTML = `
  <div class="demo-shell">
    <header class="demo-header">
      <div>
        <h1 class="demo-title">Matrix Transforms</h1>
        <p class="demo-subtitle">
          Explore how matrices act on vectors. More controls coming soon.
        </p>
      </div>
    </header>
    <section class="demo-layout ${ACTIVE_MATRIX_LAYOUT_PROFILE.containerModeClassName}">
      <section
        class="demo-panel demo-layout-panel demo-layout-panel-controls"
        style="order: ${ACTIVE_MATRIX_LAYOUT_PROFILE.orderOf("controls")}"
      >
        <h2 class="demo-panel-title">Controls</h2>
        <p class="demo-subtitle">
          API base: <code>${API_BASE}</code>
        </p>
        <div class="demo-actions">
          <button class="demo-button" id="btn">Check backend /health</button>
        </div>
      </section>
      <section
        class="demo-panel demo-layout-panel demo-layout-panel-output"
        style="order: ${ACTIVE_MATRIX_LAYOUT_PROFILE.orderOf("output")}"
      >
        <h2 class="demo-panel-title">Health response</h2>
        <pre class="demo-output" id="out" aria-live="polite"></pre>
      </section>
    </section>
  </div>
`;

const out = document.querySelector<HTMLPreElement>("#out")!;
const btn = document.querySelector<HTMLButtonElement>("#btn")!;

btn.addEventListener("click", async () => {
  out.textContent = "Loading…";
  const result = await health();
  if (!result.ok) {
    out.textContent = `Error: ${result.error.message}`;
    return;
  }
  out.textContent = JSON.stringify(result.value, null, 2);
});
