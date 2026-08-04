import { headers } from "next/headers";
import type { Metadata } from "next";
import { getAuth } from "@/lib/community/auth";
import { communityEnabled } from "@/lib/community/db";
import {
  getTerritoryByCode,
  listPinsByUser,
  listPosts,
  listRecentThreads,
  listTerritories,
  listTerritoryPins,
} from "@/lib/community/queries";
import WorkshopClient from "@/components/community/WorkshopClient";

// The map: where Patternflow could go, and who is working where.
//
// A territory is a DIRECTION, not a milestone — "OSC over a wire", "a
// laser-cut version", "a bigger panel". That is a different axis from
// /roadmap, which is what the project ships and when, and the two are
// deliberately separate lists.
//
// Which territory is open lives in the URL (?z=A3) so a link can point at one
// and the server can load its pins and threads in the same pass. The
// constellation/floor-plan choice does not: that is a reading preference,
// remembered per browser like the wall's zoom.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The workshop / Patternflow Community",
  description:
    "Directions Patternflow could be taken in, and who is working on which — pin yourself, or start a thread.",
};

/** Threads shown in the drawer before it sends you to the territory page. */
const DRAWER_THREADS = 6;

export default async function CommunityMapPage(props: {
  searchParams: Promise<{ z?: string; view?: string }>;
}) {
  if (!communityEnabled()) return null; // layout already rendered the notice

  const { z } = await props.searchParams;
  const territories = await listTerritories();

  // Nothing selected? Open the first one. A map whose drawer is empty until
  // you click looks broken rather than inviting.
  const selected =
    (z ? await getTerritoryByCode(z) : null) ??
    (territories.length > 0 ? territories[0] : null);

  const session = await getAuth().api.getSession({ headers: await headers() });
  const viewerId = session?.user.id ?? null;

  const [pins, threads, myPins, recent] = await Promise.all([
    selected ? listTerritoryPins(selected.id) : Promise.resolve([]),
    selected
      ? listPosts({ territoryId: selected.id, limit: DRAWER_THREADS })
      : Promise.resolve([]),
    viewerId ? listPinsByUser(viewerId) : Promise.resolve([]),
    // Proof of life across all territories, not just the selected one.
    listRecentThreads(),
  ]);

  return (
    <WorkshopClient
      territories={territories}
      selected={selected}
      recent={recent.map((thread) => ({
        id: thread.id,
        title: thread.title,
        createdAt: thread.createdAt.toISOString(),
        username: thread.username,
        displayUsername: thread.displayUsername,
        commentCount: thread.commentCount,
        territoryCode: thread.territoryCode,
        territoryTitle: thread.territoryTitle,
      }))}
      pins={pins.map((pin) => ({
        userId: pin.userId,
        username: pin.username,
        displayUsername: pin.displayUsername,
        note: pin.note,
        createdAt: pin.createdAt.toISOString(),
      }))}
      threads={threads.map((thread) => ({
        id: thread.id,
        title: thread.title,
        body: thread.body,
        createdAt: thread.createdAt.toISOString(),
        username: thread.username,
        displayUsername: thread.displayUsername,
        commentCount: thread.commentCount,
      }))}
      viewerId={viewerId}
      myPinCodes={myPins.map((pin) => pin.code)}
    />
  );
}
