/**
 * Purpose: Normalize raw editable input text to a non-negative decimal format.
 * Inputs: User-entered text.
 * Returns: Sanitized text containing digits and at most one decimal point.
 * Side effects: None (pure computation).
 */
export function sanitizeNonNegativeDecimalText(raw: string): string {
  if (!raw) {
    return '';
  }
  const trimmed = raw.trim();
  let output = '';
  let sawDecimal = false;
  for (const char of trimmed) {
    if (char >= '0' && char <= '9') {
      output += char;
      continue;
    }
    if (char === '.' && !sawDecimal) {
      output += char;
      sawDecimal = true;
    }
  }
  return output;
}

/**
 * Purpose: Parse a non-negative decimal input string into a number.
 * Inputs: Sanitized numeric input text.
 * Returns: Parsed number or `null` when not parseable.
 * Side effects: None (pure computation).
 */
export function parseNonNegativeDecimalText(text: string): number | null {
  if (!text || text === '.') {
    return null;
  }
  const value = Number.parseFloat(text);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

/**
 * Purpose: Read and sanitize an editable draft input value in-place.
 * Inputs: Input element plus trailing-decimal dispatch behavior.
 * Returns: Sanitized text, parsed numeric value, and dispatch readiness.
 * Side effects: May update the input element value to sanitized text.
 */
export function readNonNegativeDraftInputValue(
  input: HTMLInputElement,
  options: {
    deferTrailingDecimal?: boolean;
    deferZeroOnlyFraction?: boolean;
  } = {}
): {
  text: string;
  value: number | null;
  shouldDispatch: boolean;
} {
  const sanitized = sanitizeNonNegativeDecimalText(input.value);
  if (sanitized !== input.value) {
    input.value = sanitized;
  }
  const value = parseNonNegativeDecimalText(sanitized);
  if (value === null) {
    return {
      text: sanitized,
      value: null,
      shouldDispatch: false,
    };
  }
  const shouldDeferTrailingDecimal = options.deferTrailingDecimal ?? true;
  const decimalIndex = sanitized.indexOf('.');
  const fractionText =
    decimalIndex >= 0 && decimalIndex < sanitized.length - 1
      ? sanitized.slice(decimalIndex + 1)
      : '';
  const isZeroWithOnlyZeroFraction =
    value === 0 && fractionText.length > 0 && /^0+$/.test(fractionText);
  const shouldDeferZeroOnlyFraction = options.deferZeroOnlyFraction ?? true;
  const shouldDispatch = !(
    (shouldDeferTrailingDecimal && sanitized.endsWith('.')) ||
    (shouldDeferZeroOnlyFraction && isZeroWithOnlyZeroFraction)
  );
  return {
    text: sanitized,
    value,
    shouldDispatch,
  };
}

/**
 * Purpose: Format editable numeric values without forcing fixed-width decimal padding.
 * Inputs: Numeric value to display in editable inputs.
 * Returns: Input-friendly decimal string.
 * Side effects: None (pure computation).
 */
export function formatEditableInputValue(value: number): string {
  if (!Number.isFinite(value)) {
    return '';
  }
  const fixed = Math.max(0, value).toFixed(6);
  return fixed.replace(/(?:\.0+|(\.\d+?)0+)$/, '$1');
}
