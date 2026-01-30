import "@shared/ui/demo-shell.css";
import "./style.css";
import { getApiBaseUrl, health } from "./lib/api";

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
    <section class="demo-panel">
      <p class="demo-subtitle">
        API base: <code>${API_BASE}</code>
      </p>
      <div class="demo-actions">
        <button class="demo-button" id="btn">Check backend /health</button>
      </div>
      <pre class="demo-output" id="out" aria-live="polite"></pre>
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
