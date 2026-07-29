/**
 * Deck / Saved smoke test — `npm run check:deck`.
 *
 * Two things here are easy to break without noticing: the migration that turns
 * an existing "cart" into a deck (get it wrong and people silently lose what
 * they collected), and the guard that stops a pattern with no firmware header
 * reaching a build.
 */

// deck.ts is browser code. A tiny localStorage stand-in is enough — it only
// ever calls getItem/setItem/removeItem and dispatches an event.
const store = new Map<string, string>();
const listeners: (() => void)[] = [];
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
  dispatchEvent: () => {
    for (const fn of listeners) fn();
    return true;
  },
  CustomEvent: class {
    constructor(public type: string) {}
  },
};
(globalThis as unknown as { CustomEvent: unknown }).CustomEvent = (
  globalThis as unknown as { window: { CustomEvent: unknown } }
).window.CustomEvent;

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got ${JSON.stringify(actual)}\n        want ${JSON.stringify(expected)}`}`,
  );
}

const item = (n: number, code = "#pragma once") => ({
  patternId: `p${n}`,
  title: `Pattern ${n}`,
  code,
});

async function main() {
  const deck = await import("../src/lib/community/deck");

  console.log("\n── a cart from before the split becomes a deck ──");
  // Whatever someone had collected has to still be there afterwards, or the
  // rename quietly throws their work away.
  store.set("pf-module-cart", JSON.stringify([item(1), item(2)]));
  check("legacy cart is adopted", deck.deckItems().map((i) => i.patternId), ["p1", "p2"]);
  check("legacy key is cleared", store.has("pf-module-cart"), false);
  check("adoption happens once", deck.deckItems().length, 2);

  console.log("\n── deck cap ──");
  deck.deckClear();
  for (let n = 1; n <= deck.DECK_MAX; n += 1) deck.deckAdd(item(n));
  check("fills to the cap", deck.deckItems().length, deck.DECK_MAX);
  const overflow = deck.deckAdd(item(99));
  check("refuses one over", overflow.ok, false);
  check("says why", Boolean(overflow.reason), true);
  // Re-adding something already in the deck refreshes it rather than failing,
  // or a header that changed upstream could never be updated.
  check("re-adding an existing one is fine", deck.deckAdd(item(1)).ok, true);
  check("and does not grow the deck", deck.deckItems().length, deck.DECK_MAX);

  console.log("\n── running order ──");
  deck.deckClear();
  deck.deckAdd(item(1));
  deck.deckAdd(item(2));
  deck.deckAdd(item(3));
  check("added in order", deck.deckItems().map((i) => i.patternId), ["p1", "p2", "p3"]);
  deck.deckMove("p3", -1);
  check("moves up", deck.deckItems().map((i) => i.patternId), ["p1", "p3", "p2"]);
  deck.deckMove("p1", 1);
  check("moves down", deck.deckItems().map((i) => i.patternId), ["p3", "p1", "p2"]);
  deck.deckMove("p3", -1);
  check("will not move past the top", deck.deckItems().map((i) => i.patternId), ["p3", "p1", "p2"]);
  deck.deckMove("p2", 1);
  check("will not move past the end", deck.deckItems().map((i) => i.patternId), ["p3", "p1", "p2"]);
  deck.deckMove("nope", 1);
  check("unknown id is a no-op", deck.deckItems().length, 3);

  console.log("\n── saved has no cap ──");
  deck.savedClear();
  for (let n = 1; n <= deck.DECK_MAX + 15; n += 1) deck.savedAdd(item(n));
  check("holds more than a deck", deck.savedItems().length, deck.DECK_MAX + 15);
  check("newest first", deck.savedItems()[0].patternId, `p${deck.DECK_MAX + 15}`);
  deck.savedAdd(item(1, "#pragma once // updated"));
  check("re-saving updates in place", deck.savedItems().length, deck.DECK_MAX + 15);

  console.log("\n── promoting a saved pattern ──");
  deck.deckClear();
  deck.savedClear();
  deck.savedAdd(item(7));
  check("promotes into the deck", deck.savedToDeck("p7").ok, true);
  check("and stays saved", deck.savedHas("p7"), true);
  check("now in the deck too", deck.deckHas("p7"), true);
  check("unknown id is refused", deck.savedToDeck("nope").ok, false);

  // A pattern can be saved before its author has ported it to firmware. Letting
  // that into a deck would send an empty file to the compiler.
  deck.savedAdd(item(8, ""));
  const noHeader = deck.savedToDeck("p8");
  check("refuses a pattern with no header", noHeader.ok, false);
  check("explains why", noHeader.reason?.includes("firmware header"), true);
  check("and it never reaches the deck", deck.deckHas("p8"), false);
  check("buildable check agrees", deck.savedIsBuildable(item(8, "")), false);
  check("a real header is buildable", deck.savedIsBuildable(item(9)), true);

  console.log("\n── the two lists are independent ──");
  deck.deckClear();
  check("clearing the deck leaves saved alone", deck.savedItems().length > 0, true);
  deck.savedClear();
  check("and clearing saved empties it", deck.savedItems().length, 0);
}

main()
  .then(() => {
    console.log(failures === 0 ? "\nAll deck checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
