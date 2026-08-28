// Keyboard focus trap for dialogs/drawers. Moves focus ourselves on every Tab instead of only
// wrapping at the edges: Safari never Tab-focuses <a> elements, so an edge-only trap whose
// "last" element is a link is unreachable there and focus escapes to the page behind the dialog.
// Programmatic .focus() on links works in every browser, so stepping explicitly is robust.
type Focusable = { focus(): void };
export function trapTab<T extends Focusable>(
  e: { key: string; shiftKey: boolean; preventDefault(): void },
  list: T[],
  active: unknown = typeof document === "undefined" ? null : document.activeElement,
) {
  if (e.key !== "Tab" || list.length === 0) return;
  e.preventDefault();
  const i = list.indexOf(active as T);
  const next = i === -1 ? (e.shiftKey ? list.length - 1 : 0) : (i + (e.shiftKey ? -1 : 1) + list.length) % list.length;
  list[next].focus();
}
