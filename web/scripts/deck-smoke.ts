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

  // Saved is gone - the like replaced it, and the feed's "Liked" tab is where
  // it is read back from. What survives from those tests is the rule that
  // guarded the boundary between the two lists: a pattern whose author has not
  // shipped a firmware header cannot enter a deck, because building one would
  // hand the compiler an empty file.
  console.log("\n── a deck refuses what cannot be built ──");
  deck.deckClear();
  const noHeader = deck.deckAdd(item(8, ""));
  check("refuses a pattern with no header", noHeader.ok, false);
  check("and it never reaches the deck", deck.deckHas("p8"), false);
  check("buildable check agrees", deck.deckIsBuildable(item(8, "")), false);
  check("a real header is buildable", deck.deckIsBuildable(item(9)), true);
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
