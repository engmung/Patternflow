import { headers } from "next/headers";
import type { Metadata } from "next";
import { isAdminSession } from "@/lib/community/server/admin";
import { getAuth } from "@/lib/community/server/auth";
import { communityEnabled } from "@/lib/community/server/db";
import { listAtlasPins } from "@/lib/community/server/queries";
import AtlasClient from "@/components/community/AtlasClient";

// The atlas: a map of pattern-technique space. It charts where PATTERNS could
// go — verified continents, open frontier, invented hypotheses, and, pinned
// between them, the actual published work: each pin is a live pattern placed
// where it belongs.
//
// Technique entries live in lib/atlas/data.ts and are edited like the seed
// script. Pins live in the atlas_pins table.
//
// An archive since 26 October 2026. The community's menu and phone tabs no
// longer name it; the footer's Archive link does. Until then an author could
// add a published pattern here, move it and tie it to the prompt point it
// came from. The pins stay as they were left, and the route refuses writes.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Atlas archive / Patternflow Community",
  description:
    "A map of pattern-technique space, kept as an archive — verified continents, open frontier, published patterns pinned in place, and ready-made generation prompts for exploring each point.",
};

export default async function AtlasPage() {
  if (!communityEnabled()) return null; // layout already redirected or rendered the notice

  // The viewer still matters to a read: a private research note shows only to
  // its author and to moderators.
  const session = await getAuth().api.getSession({ headers: await headers() });
  const viewerId = session?.user.id ?? null;
  const pins = await listAtlasPins(viewerId ? { id: viewerId, isAdmin: isAdminSession(session) } : null);

  return (
    <AtlasClient
      pins={pins.map((pin) => ({
        patternId: pin.patternId,
        x: pin.x,
        y: pin.y,
        entryId: pin.entryId,
        kind: pin.kind === "research" ? ("research" as const) : ("pin" as const),
        title: pin.title,
        code: pin.code,
        username: pin.username,
        displayUsername: pin.displayUsername,
      }))}
    />
  );
}
