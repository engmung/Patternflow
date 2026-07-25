import { getBuild } from "@/lib/community/builds";
import { preflight, withCors } from "@/lib/community/cors";
import { communityEnabled, communityHomeUrl } from "@/lib/community/db";
import { APP_OFFSET, STATIC_FLASH_PARTS } from "@/lib/firmware/paths";

// GET /api/community/builds/[id]/manifest — an esp-web-tools manifest for a
// custom build.
//
// The bootloader and partition table are the ones already committed for the
// stock firmware; only the application image is per-build. Paths are absolute
// URLs rather than relative ones: esp-web-tools resolves them against the
// manifest's own URL, and this manifest is served from a deep API path where
// relative paths would resolve to nonsense.

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return withCors(request, await handleGet(request, context));
}

export const OPTIONS = preflight;

/** Origin the flasher should fetch parts from — this deployment's own. */
function selfOrigin(request: Request): string {
  const host = request.headers.get("host");
  if (!host) return communityHomeUrl().replace(/\/+$/, "");
  const proto =
    request.headers.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}

async function handleGet(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not enabled on this deployment." }, { status: 503 });
  }

  const { id } = await context.params;
  const build = await getBuild(id);
  if (!build || build.status !== "done") {
    return Response.json({ error: "No firmware for this build." }, { status: 404 });
  }

  const origin = selfOrigin(request);
  const names = build.namespaces ? (JSON.parse(build.namespaces) as string[]) : [];

  return Response.json(
    {
      name: names.length > 0 ? `Patternflow — ${names.join(", ")}` : "Patternflow (custom build)",
      version: build.id,
      // A custom build replaces the whole image, so a fresh erase is the
      // predictable outcome — the same choice the stock manifest makes.
      new_install_prompt_erase: true,
      builds: [
        {
          chipFamily: "ESP32-S3",
          parts: [
            ...STATIC_FLASH_PARTS.map((part) => ({ path: `${origin}${part.path}`, offset: part.offset })),
            { path: `${origin}/api/community/builds/${build.id}/firmware`, offset: APP_OFFSET },
          ],
        },
      ],
    },
    { headers: { "Cache-Control": "private, max-age=3600" } },
  );
}
