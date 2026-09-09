/** Debounce edits, with a deadline so continuous knob movement still saves. */
export function createAutosave(save: () => boolean, onResult: (saved: boolean) => void) {
  let debounce: ReturnType<typeof setTimeout> | null = null;
  let deadline: ReturnType<typeof setTimeout> | null = null;
  let pending = false;

  function flush(): boolean | null {
    if (!pending) return null;
    if (debounce !== null) clearTimeout(debounce);
    if (deadline !== null) clearTimeout(deadline);
    debounce = deadline = null;
    pending = false;
    const saved = save();
    onResult(saved);
    return saved;
  }

  return {
    schedule() {
      pending = true;
      if (debounce !== null) clearTimeout(debounce);
      debounce = setTimeout(flush, 600);
      if (deadline === null) deadline = setTimeout(flush, 3000);
    },
    flush,
  };
}
