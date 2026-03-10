export type MathTextStyle = 'current' | 'tex-like';
export type MathTextMode = 'plain' | 'html';

const SUBSCRIPT_DIGITS = new Map<string, string>([
  ['0', '₀'],
  ['1', '₁'],
  ['2', '₂'],
  ['3', '₃'],
  ['4', '₄'],
  ['5', '₅'],
  ['6', '₆'],
  ['7', '₇'],
  ['8', '₈'],
  ['9', '₉'],
  ['-', '₋'],
]);

const subscriptCache = new Map<number, string>();
const indexedSymbolCache = new Map<string, string>();

/**
 * Return the class list for math text content based on style selection.
 */
export function mathTextClassName(style: MathTextStyle = 'current'): string {
  return style === 'tex-like'
    ? 'math-text math-text--tex-like'
    : 'math-text math-text--current';
}

/**
 * Format a number with fixed precision for math labels.
 */
export function formatMathNumber(
  value: number,
  fractionDigits = 2
): string {
  if (!Number.isFinite(value)) {
    return Number(0).toFixed(fractionDigits);
  }
  return value.toFixed(fractionDigits);
}

/**
 * Format an index using unicode subscript digits.
 */
export function formatSubscriptIndex(value: number): string {
  const cached = subscriptCache.get(value);
  if (cached !== undefined) {
    return cached;
  }

  const formatted = String(value)
    .split('')
    .map((character) => SUBSCRIPT_DIGITS.get(character) ?? character)
    .join('');
  subscriptCache.set(value, formatted);
  return formatted;
}

/**
 * Format a math symbol with index, optionally producing HTML for tex-like styling.
 */
export function formatIndexedMathSymbol(options: {
  symbol: string;
  index: number;
  style?: MathTextStyle;
  mode?: MathTextMode;
}): string {
  const style = options.style ?? 'current';
  const mode = options.mode ?? 'plain';
  const cacheKey = `${style}|${mode}|${options.symbol}|${options.index}`;
  const cached = indexedSymbolCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const formatted =
    mode === 'html'
      ? `<span class="math-indexed"><span class="math-symbol">${escapeHtml(options.symbol)}</span><sub class="math-subscript">${escapeHtml(String(options.index))}</sub></span>`
      : `${options.symbol}${formatSubscriptIndex(options.index)}`;
  indexedSymbolCache.set(cacheKey, formatted);
  return formatted;
}

/**
 * Format an indexed symbol assignment like f_1=2.00.
 */
export function formatIndexedMathAssignment(options: {
  symbol: string;
  index: number;
  value: number;
  style?: MathTextStyle;
  mode?: MathTextMode;
  fractionDigits?: number;
}): string {
  return `${formatIndexedMathSymbol({
    symbol: options.symbol,
    index: options.index,
    style: options.style,
    mode: options.mode,
  })}=${formatMathNumber(options.value, options.fractionDigits ?? 2)}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
