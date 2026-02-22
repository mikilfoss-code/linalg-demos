/**
 * Create a single root HTMLElement from template markup.
 */
export function createTemplateElement(markup: string, context = 'template'): HTMLElement {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  const node = template.content.firstElementChild;
  if (!(node instanceof HTMLElement)) {
    throw new Error(`Expected a single root HTMLElement for ${context}.`);
  }
  return node;
}

/**
 * Query for a required element and throw when it is missing.
 */
export function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}
