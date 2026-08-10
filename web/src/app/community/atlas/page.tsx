import { headers } from "next/headers";
import type { Metadata } from "next";
import { isAdminSession } from "@/lib/community/admin";
import { getAuth } from "@/lib/community/auth";
import { communityEnabled } from "@/lib/community/db";
import { listAtlasPins, listPatternsByUser } from "@/lib/community/queries";
import AtlasClient from "@/components/community/AtlasClient";

// The atlas: a map of pattern-technique space, sibling to the workshop map.
// The workshop charts where the HARDWARE could go (territories = project
// directions); this charts where PATTERNS could go — verified continents,
// open frontier, invented hypotheses, and, pinned between them, the actual
// published work: each pin is a live pattern placed where it belongs.
//
// Technique entries live in lib/atlas/data.ts and are edited like the seed
// script. Pins live in the atlas_pins table.
//
// Connecting work to the map happens HERE, by hand: publishing stays its own
// flow, and the atlas offers "add my pattern" — pick one of your published
// patterns, click where it belongs, and (optionally) tie it to the prompt
// point it came from. Nothing is inferred, nothing rides the publish flow.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Atlas / Patternflow Community",
  description:
    "A map of pattern-technique space — verified continents, open frontier, published patterns pinned in place, and ready-made generation prompts for exploring each point.",
};

export default async function AtlasPage() {
  if (!communityEnabled()) return null; // layout already redirected or rendered the notice

  const session = await getAuth().api.getSession({ headers: await headers() });
  const viewerId = session?.user.id ?? null;
  const isAdmin = isAdminSession(session);

  const pins = await listAtlasPins();

  // The picker: the viewer's own public patterns that are not on the map yet,
  // newest first (listPatternsByUser already orders that way) and carrying
  // their code — you pick by looking at the pattern, not by reading a title.
  const pinned = new Set(pins.map((pin) => pin.patternId));
  const myPatterns = viewerId
    ? (await listPatternsByUser(viewerId, viewerId))
        .filter((pattern) => pattern.visibility === "public" && !pinned.has(pattern.id))
        .map((pattern) => ({ id: pattern.id, title: pattern.title, code: pattern.code }))
    : [];

  return (
    <AtlasClient
      pins={pins.map((pin) => ({
        patternId: pin.patternId,
        x: pin.x,
        y: pin.y,
        entryId: pin.entryId,
        title: pin.title,
        code: pin.code,
        userId: pin.userId,
        username: pin.username,
        displayUsername: pin.displayUsername,
      }))}
      viewerId={viewerId}
      isAdmin={isAdmin}
      myPatterns={myPatterns}
    />
  );
}
