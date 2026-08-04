/**
 * Minimal DOM construction helpers.
 *
 * Every node is built explicitly and all text goes in through `textContent`.
 * There is no code path in this application that puts a user-supplied string
 * into an HTML parser, which is what makes the injection tests trivially true
 * rather than a matter of escaping carefully.
 */

type Attrs = Record<string, string | number | boolean | undefined>;
type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key === 'class') {
      node.className = String(value);
    } else if (key === 'text') {
      node.textContent = String(value);
    } else if (key === 'value' && node instanceof HTMLInputElement) {
      node.value = String(value);
    } else if (key === 'value' && node instanceof HTMLTextAreaElement) {
      node.value = String(value);
    } else if (value === true) {
      node.setAttribute(key, '');
    } else {
      node.setAttribute(key, String(value));
    }
  }

  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }

  return node;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function mount(parent: HTMLElement, ...children: (Node | null | false)[]): void {
  clear(parent);
  for (const child of children) if (child) parent.appendChild(child);
}

/**
 * Moves focus to a newly rendered screen and announces it.
 * Without this, a screen reader user is left where the old screen used to be.
 */
export function focusScreen(node: HTMLElement): void {
  const heading = node.querySelector<HTMLElement>('[data-focus]') ?? node;
  heading.setAttribute('tabindex', '-1');
  heading.focus({ preventScroll: false });
}

export function announce(region: HTMLElement, message: string): void {
  // Clearing first forces assistive tech to re-read an identical message.
  region.textContent = '';
  window.setTimeout(() => {
    region.textContent = message;
  }, 40);
}
