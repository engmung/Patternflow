import { getAuth } from "@/lib/community/auth";
import { communityEnabled, getDb } from "@/lib/community/db";
import { getPatternStub, newId } from "@/lib/community/queries";
import { rateLimit } from "@/lib/community/ratelimit";
import { patterns } from "@/lib/community/schema";
import { cleanCode, cleanDescription, cleanTitle } from "@/lib/community/validate";
import { LICENSE_OPTIONS } from "@/lib/sharePattern";

// POST /api/community/patterns — publish (or fork-publish) a pattern.
// Reads happen in server components; only mutations go through the API.

export async function POST(request: Request) {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not enabled on this deployment." }, { status: 503 });
  }

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Sign in to share a pattern." }, { status: 401 });
  }

  if (!rateLimit(`publish:${session.user.id}`, 5, 60_000)) {
    return Response.json({ error: "Too many uploads — wait a minute and try again." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;

  const title = cleanTitle(raw.title);
  if (!title) return Response.json({ error: "Title is required (max 80 chars)." }, { status: 400 });

  const description = cleanDescription(raw.description);
  if (description === undefined) {
    return Response.json({ error: "Description is too long (max 2000 chars)." }, { status: 400 });
  }

  const code = cleanCode(raw.code);
  if (!code) return Response.json({ error: "Pattern code is missing or over 100KB." }, { status: 400 });

  const license =
    LICENSE_OPTIONS.find((option) => option.spdx === raw.license)?.spdx ?? "CC-BY-SA-4.0";

  // Fork lineage: only record parents that actually exist; a dangling or
  // malformed parentId silently degrades to an original post.
  let parentId: string | null = null;
  if (typeof raw.parentId === "string" && raw.parentId.length > 0) {
    const parent = await getPatternStub(raw.parentId);
    parentId = parent?.id ?? null;
  }

  const now = new Date();
  const id = newId();
  await getDb().insert(patterns).values({
    id,
    userId: session.user.id,
    title,
    description,
    code,
    license,
    parentId,
    createdAt: now,
    updatedAt: now,
  });

  return Response.json({ id }, { status: 201 });
}
