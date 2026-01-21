import "./style.css";
import { getApiBaseUrl, health } from "./lib/api";

const API_BASE = getApiBaseUrl() || "(same origin)";

const el = document.querySelector<HTMLDivElement>("#app");
if (!el) throw new Error("Missing #app element");

el.innerHTML = `
  <div style="font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 1rem;">
    <h1 style="margin: 0 0 0.5rem 0;">Linear Algebra Demo</h1>
    <p style="margin: 0 0 1rem 0;">
      API base: <code>${API_BASE}</code>
    </p>
    <button id="btn" style="padding: 0.5rem 0.75rem;">Check backend /health</button>
    <pre id="out" style="margin-top: 1rem; padding: 0.75rem; background: #f6f6f6; border-radius: 8px; overflow:auto;"></pre>
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
