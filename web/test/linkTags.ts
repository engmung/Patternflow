// What the link prefetch tests read: the `.tsx` files under a folder and the
// `<Link …>` opening tags in each.

import fs from "node:fs";
import path from "node:path";

/** `web/src/`. */
export const src = path.resolve(__dirname, "../src");

/** Every `.tsx` under `dir`, tests left out. */
export function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return entry.name.endsWith(".tsx") && !entry.name.includes(".test.") ? [full] : [];
  });
}

/** Each `<Link …>` opening tag, read to the `>` outside any braces. */
export function linkTags(source: string): string[] {
  const tags: string[] = [];
  for (const m of source.matchAll(/<Link\b/g)) {
    let depth = 0;
    let end = m.index + m[0].length;
    for (; end < source.length; end++) {
      const c = source[end];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    tags.push(source.slice(m.index, end + 1));
  }
  return tags;
}

/** Each `<Link>` in the files under `dirs` (relative to `src/`), with the file
 *  it is in, relative to `src/` with forward slashes. */
export function links(...dirs: string[]): { rel: string; tag: string }[] {
  return dirs.flatMap((dir) =>
    sources(path.join(src, dir)).flatMap((file) => {
      const rel = path.relative(src, file).split(path.sep).join("/");
      return linkTags(fs.readFileSync(file, "utf8")).map((tag) => ({ rel, tag }));
    }),
  );
}
