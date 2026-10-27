import path from "node:path";
import { communityDataDir } from "./db";

// Where a workshop thread's files live on disk.
//
// The workshop came down on 26 October 2026 and nothing writes or serves these
// any more. The rows and the bytes stay, and so does this: deleting an account
// still cascades its threads' attachment rows away, and the retention sweep
// reads this directory to remove the files those rows left behind. Server code
// only, because `communityDataDir` drags better-sqlite3 in behind it.

/** Named by opaque id, never by the uploaded filename. */
export function attachmentDir(): string {
  return path.join(communityDataDir(), "attachments");
}
