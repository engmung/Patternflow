// The module cart: hardware-ready patterns collected across the community
// site, built together into loadable .pfm modules with one request.
//
// Client-side and localStorage-backed on purpose. A cart is browsing state,
// not data — it holds copies of pattern headers the visitor could re-collect
// in a minute, so losing it on a cleared browser costs nothing, and keeping it
// out of the database means no schema, no auth question ("whose cart?") and no
// sync. Components listen for CART_EVENT on window to stay in step, because
// storage events alone do not fire in the tab that made the change.

export type CartItem = {
  /** Community pattern id — used to de-duplicate, and to link back. */
  patternId: string;
  title: string;
  /** The verified .h header the pattern ships. */
  code: string;
};

/** Mirrors MAX_MODULE_PATTERNS_PER_BUILD on the build API. */
export const CART_MAX = 10;

export const CART_EVENT = "pf-module-cart-changed";

const KEY = "pf-module-cart";

function read(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is CartItem =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as CartItem).patternId === "string" &&
        typeof (entry as CartItem).title === "string" &&
        typeof (entry as CartItem).code === "string",
    );
  } catch {
    return [];
  }
}

function write(items: CartItem[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Private mode: the cart degrades to per-page state; the event still fires
    // so the UI reflects what the visitor just did.
  }
  window.dispatchEvent(new CustomEvent(CART_EVENT));
}

export function cartItems(): CartItem[] {
  return read();
}

export function cartHas(patternId: string): boolean {
  return read().some((item) => item.patternId === patternId);
}

/** Add, or refresh the stored header if the pattern is already in. */
export function cartAdd(item: CartItem): { ok: boolean; reason?: string } {
  const items = read();
  const existing = items.findIndex((entry) => entry.patternId === item.patternId);
  if (existing >= 0) {
    items[existing] = item;
    write(items);
    return { ok: true };
  }
  if (items.length >= CART_MAX) {
    return { ok: false, reason: `The cart holds at most ${CART_MAX} patterns.` };
  }
  items.push(item);
  write(items);
  return { ok: true };
}

export function cartRemove(patternId: string): void {
  write(read().filter((item) => item.patternId !== patternId));
}

export function cartClear(): void {
  write([]);
}
