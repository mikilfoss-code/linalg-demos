import "./style.css";
import { health } from "./lib/api";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";

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
  try {
    const data = await health();
    out.textContent = JSON.stringify(data, null, 2);
  } catch (e: any) {
    out.textContent = `Error: ${e?.message ?? String(e)}`;
  }
});
