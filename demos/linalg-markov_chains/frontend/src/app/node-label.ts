/**
 * Build HTML markup for a node label using the canonical N_i notation.
 */
export function formatNodeLabelMarkup(index: number): string {
  return `N<sub class="markov-node-label-subscript">${index + 1}</sub>`;
}

/**
 * Build plain-text fallback node label (used for aria labels and debug text).
 */
export function formatNodeLabelText(index: number): string {
  return `N${index + 1}`;
}
