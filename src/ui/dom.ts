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

/**
 * Replaces a parent's children wholesale. If the focused element lived inside
 * `parent`, focus is restored to its replacement by matching `id` - otherwise
 * an in-place answer commit (which rebuilds the whole screen) would silently
 * drop focus to <body> on every tap, which some browsers treat as a cue to
 * scroll to the top of the page.
 */
export function mount(parent: HTMLElement, ...children: (Node | null | false)[]): void {
  const active = document.activeElement;
  const activeId =
    active instanceof HTMLElement && active.id && parent.contains(active) ? active.id : null;

  clear(parent);
  for (const child of children) if (child) parent.appendChild(child);

  if (activeId) {
    const restored = parent.querySelector<HTMLElement>(`[id="${activeId}"]`);
    restored?.focus({ preventScroll: true });
  }
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
