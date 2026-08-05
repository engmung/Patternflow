import { eq } from "drizzle-orm";
import { isAdminSession } from "@/lib/community/admin";
import { getAuth } from "@/lib/community/auth";
import { originBlocked, preflight, withCors } from "@/lib/community/cors";
import { communityEnabled, getDb } from "@/lib/community/db";
import {
  QUESTION_MAX,
  TERRITORY_DESC_MAX,
  cleanQuestions,
  cleanSpan,
  cleanStageCoord,
  cleanTerritoryCode,
  cleanTerritoryDescription,
  cleanTerritoryTitle,
  overlongQuestion,
} from "@/lib/community/workshop";
import { getTerritoryByCode } from "@/lib/community/queries";
import { territories } from "@/lib/community/schema";

// PATCH  /api/community/territories/[code] — edit one, or archive/restore it.
// DELETE /api/community/territories/[code] — only when nothing hangs off it.
//
// Archiving is the normal way to retire a direction: the threads written in it
// are still worth reading, and the codes are in their URLs. Deleting is for
// the case archiving does not cover — a typo'd territory nobody used — and is
// refused the moment it would take somebody's writing with it.
//
// The code itself is NOT editable. It is the identity: it appears in every
// thread URL under this territory, and renaming it would break every link
// anybody had shared.

type Context = { params: Promise<{ code: string }> };

export async function PATCH(request: Request, context: Context) {
  const blocked = originBlocked(request);
  if (blocked) return blocked;
  return withCors(request, await handlePatch(request, context));
}

export async function DELETE(request: Request, context: Context) {
  const blocked = originBlocked(request);
  if (blocked) return blocked;
  return withCors(request, await handleDelete(request, context));
}

export const OPTIONS = preflight;

/** The territory, or the response saying why not. Spelled out rather than
 *  inferred so `resolved.error` narrows for the callers. */
type Resolved =
  | { error: Response; territory?: undefined }
  | { error?: undefined; territory: NonNullable<Awaited<ReturnType<typeof getTerritoryByCode>>> };

async function resolve(request: Request, context: Context): Promise<Resolved> {
  if (!communityEnabled()) {
    return {
      error: Response.json(
        { error: "Community is not enabled on this deployment." },
        { status: 503 },
      ),
    };
  }
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!isAdminSession(session)) {
    return { error: Response.json({ error: "Not found." }, { status: 404 }) };
  }
  const { code: rawCode } = await context.params;
  const code = cleanTerritoryCode(rawCode);
  const territory = code ? await getTerritoryByCode(code) : null;
  if (!territory) {
    return { error: Response.json({ error: "Territory not found." }, { status: 404 }) };
  }
  return { territory };
}

async function handlePatch(request: Request, context: Context) {
  const resolved = await resolve(request, context);
  if (resolved.error) return resolved.error;
  const { territory } = resolved;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const raw = payload as Record<string, unknown>;

  // Every field is optional — the editor sends what changed, and archiving
  // arrives as its own one-key body.
  const patch: Record<string, unknown> = {};

  if (raw.title !== undefined) {
    const title = cleanTerritoryTitle(raw.title);
    if (!title) return Response.json({ error: "A title is required." }, { status: 400 });
    patch.title = title;
  }
  if (raw.description !== undefined) {
    const description = cleanTerritoryDescription(raw.description);
    if (description === undefined) {
      return Response.json(
        {
          error:
            `A description is at most ${TERRITORY_DESC_MAX} characters — that one is ` +
            `${typeof raw.description === "string" ? raw.description.trim().length : "?"}.`,
        },
        { status: 400 },
      );
    }
    patch.description = description;
  }
  if (raw.questions !== undefined) {
    const questions = cleanQuestions(raw.questions);
    if (questions === undefined) {
      // Say WHICH line. The editor sends every field in one body, so a refusal
      // here takes the description edit down with it, and "questions are one
      // short line each" leaves you re-reading four lines to find the culprit.
      const offender = overlongQuestion(raw.questions);
      return Response.json(
        {
          error: offender
            ? `“${offender.slice(0, 24)}…” is ${offender.length} characters. ` +
              `A question hangs off the node as a chip, so it has to fit in ${QUESTION_MAX} — ` +
              "put the long version in a thread."
            : `Questions are one line each, ${QUESTION_MAX} characters at most.`,
        },
        { status: 400 },
      );
    }
    patch.questions = questions;
  }
  if (raw.span !== undefined) {
    const span = cleanSpan(raw.span);
    if (span === undefined) return Response.json({ error: "Width is 2 to 6 columns." }, { status: 400 });
    patch.span = span;
  }
  if (raw.x !== undefined) {
    const x = cleanStageCoord(raw.x, "x");
    if (x === undefined) return Response.json({ error: "Bad map position." }, { status: 400 });
    patch.x = x;
  }
  if (raw.y !== undefined) {
    const y = cleanStageCoord(raw.y, "y");
    if (y === undefined) return Response.json({ error: "Bad map position." }, { status: 400 });
    patch.y = y;
  }
  if (raw.position !== undefined) {
    const position = Math.round(Number(raw.position));
    if (!Number.isFinite(position) || position < 0) {
      return Response.json({ error: "Bad position." }, { status: 400 });
    }
    patch.position = position;
  }
  if (raw.shippingNext !== undefined) {
    patch.shippingNext = raw.shippingNext === true;
  }
  if (raw.archived !== undefined) {
    patch.archivedAt = raw.archived === true ? new Date() : null;
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "Nothing to change." }, { status: 400 });
  }

  await getDb().update(territories).set(patch).where(eq(territories.id, territory.id));
  return Response.json({ ok: true, code: territory.code });
}

async function handleDelete(request: Request, context: Context) {
  const resolved = await resolve(request, context);
  if (resolved.error) return resolved.error;
  const { territory } = resolved;

  // The counts ride on the row already (see territoryColumns), so this costs
  // nothing to check — and it is the difference between removing a mistake and
  // deleting other people's writing, which the foreign key would cascade away
  // without asking.
  if (territory.threadCount > 0 || territory.pinCount > 0) {
    return Response.json(
      {
        error:
          `${territory.code} has ${territory.threadCount} thread(s) and ${territory.pinCount} ` +
          "pin(s). Archive it instead — the threads stay readable and their links keep working.",
      },
      { status: 409 },
    );
  }

  await getDb().delete(territories).where(eq(territories.id, territory.id));
  return Response.json({ ok: true });
}
