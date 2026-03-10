import { mathTextClassName, type MathTextStyle } from './math-text';

const MATHJAX_SCRIPT_ID = 'shared-mathjax-script';
const MATHJAX_CDN_SRC = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js';

type MathJaxRuntime = {
  startup?: {
    promise?: Promise<unknown>;
  };
  tex2svgPromise?: (
    expression: string,
    options?: { display?: boolean }
  ) => Promise<HTMLElement>;
};

type MathJaxConfig = {
  tex: {
    inlineMath: [string, string][];
  };
  svg: {
    fontCache: 'none' | 'local' | 'global';
  };
  startup: {
    typeset: boolean;
  };
};

declare global {
  interface Window {
    MathJax?: MathJaxRuntime | MathJaxConfig;
  }
}

let mathJaxPromise: Promise<MathJaxRuntime | null> | null = null;

/**
 * Render all `[data-math-tex]` labels inside a root with MathJax SVG output.
 * Falls back to plain text if MathJax fails to load.
 */
export async function renderStaticMathLabels(options: {
  root: ParentNode;
  style?: MathTextStyle;
  selector?: string;
}): Promise<void> {
  const selector = options.selector ?? '[data-math-tex]';
  const labels = Array.from(options.root.querySelectorAll<HTMLElement>(selector));
  if (labels.length === 0) {
    return;
  }

  const runtime = await ensureMathJaxRuntime();
  if (!runtime?.tex2svgPromise) {
    labels.forEach((label) => {
      applyFallbackText(label, options.style ?? 'current');
    });
    return;
  }

  await Promise.all(
    labels.map(async (label) => {
      const tex = label.dataset.mathTex?.trim();
      if (!tex) {
        applyFallbackText(label, options.style ?? 'current');
        return;
      }

      const isDisplay = label.dataset.mathDisplay === 'block';
      try {
        const container = await runtime.tex2svgPromise!(tex, { display: isDisplay });
        const svg =
          container instanceof SVGSVGElement
            ? container
            : container.querySelector('svg');
        if (!svg) {
          applyFallbackText(label, options.style ?? 'current');
          return;
        }

        label.classList.add(
          ...mathTextClassName(options.style ?? 'current').split(' '),
          'math-static',
          isDisplay ? 'math-static--display' : 'math-static--inline'
        );
        label.replaceChildren(svg);
        if (!label.hasAttribute('aria-label')) {
          const fallback = label.dataset.mathFallback?.trim();
          if (fallback) {
            label.setAttribute('aria-label', fallback);
          }
        }
      } catch {
        applyFallbackText(label, options.style ?? 'current');
      }
    })
  );
}

/**
 * Fire-and-forget helper for one-time static-label rendering.
 */
export function queueStaticMathLabels(options: {
  root: ParentNode;
  style?: MathTextStyle;
  selector?: string;
}): void {
  void renderStaticMathLabels(options);
}

async function ensureMathJaxRuntime(): Promise<MathJaxRuntime | null> {
  if (!mathJaxPromise) {
    mathJaxPromise = loadMathJaxRuntime();
  }
  return mathJaxPromise;
}

function loadMathJaxRuntime(): Promise<MathJaxRuntime | null> {
  return new Promise((resolve) => {
    const runtimeNow = asMathJaxRuntime(window.MathJax);
    if (runtimeNow?.tex2svgPromise) {
      void waitForMathJaxStartup(runtimeNow).then(resolve);
      return;
    }

    if (!window.MathJax) {
      window.MathJax = {
        tex: {
          inlineMath: [
            ['$', '$'],
            ['\\(', '\\)'],
          ],
        },
        svg: {
          fontCache: 'none',
        },
        startup: {
          typeset: false,
        },
      } satisfies MathJaxConfig;
    }

    const existingScript = document.getElementById(MATHJAX_SCRIPT_ID);
    if (existingScript instanceof HTMLScriptElement) {
      attachMathJaxScriptListeners(existingScript, resolve);
      return;
    }

    const script = document.createElement('script');
    script.id = MATHJAX_SCRIPT_ID;
    script.src = MATHJAX_CDN_SRC;
    script.async = true;
    attachMathJaxScriptListeners(script, resolve);
    document.head.appendChild(script);
  });
}

function attachMathJaxScriptListeners(
  script: HTMLScriptElement,
  resolve: (runtime: MathJaxRuntime | null) => void
): void {
  const handleLoad = () => {
    const runtime = asMathJaxRuntime(window.MathJax);
    void waitForMathJaxStartup(runtime).then(resolve);
  };
  const handleError = () => {
    resolve(null);
  };

  script.addEventListener('load', handleLoad, { once: true });
  script.addEventListener('error', handleError, { once: true });
}

async function waitForMathJaxStartup(
  runtime: MathJaxRuntime | null
): Promise<MathJaxRuntime | null> {
  if (!runtime?.startup?.promise) {
    return runtime;
  }
  try {
    await runtime.startup.promise;
    return runtime;
  } catch {
    return null;
  }
}

function applyFallbackText(
  label: HTMLElement,
  style: MathTextStyle
): void {
  const fallback =
    label.dataset.mathFallback?.trim() ??
    label.textContent?.trim() ??
    label.dataset.mathTex?.trim() ??
    '';
  label.classList.add(...mathTextClassName(style).split(' '), 'math-static', 'math-static--fallback');
  label.textContent = fallback;
}

function asMathJaxRuntime(value: Window['MathJax']): MathJaxRuntime | null {
  if (!value) {
    return null;
  }
  return value as MathJaxRuntime;
}
