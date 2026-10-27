// A community form said "Network error." whenever the answer was not JSON:
// the 502 page nginx writes when the app is down, a bare 413 for a body over
// the proxy's limit. The server had answered both times. readApiError keeps
// the route's own words when there are some and gives the status when not.

import { describe, expect, it } from "vitest";
import { readApiError } from "./apiBase";

const NGINX_502 =
  "<html><head><title>502 Bad Gateway</title></head><body><center><h1>502 Bad Gateway</h1></center><hr><center>nginx</center></body></html>";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("readApiError", () => {
  it("keeps the route's own error", async () => {
    const response = json(429, { error: "Too many comments — wait a minute and try again." });
    expect(await readApiError(response, "Comment failed")).toBe(
      "Too many comments — wait a minute and try again.",
    );
  });

  it("gives the status for an HTML error page", async () => {
    const response = new Response(NGINX_502, {
      status: 502,
      headers: { "Content-Type": "text/html" },
    });
    expect(await readApiError(response, "Comment failed")).toBe("Comment failed (HTTP 502).");
  });

  it("gives the status for an empty body", async () => {
    expect(await readApiError(new Response(null, { status: 413 }), "Could not save")).toBe(
      "Could not save (HTTP 413).",
    );
  });

  it("gives the status when the JSON carries no usable error", async () => {
    for (const body of [{}, { ok: false }, { error: "" }, { error: "  " }, { error: { code: 1 } }, null, [], "nope"]) {
      expect(await readApiError(json(400, body), "Sharing failed")).toBe("Sharing failed (HTTP 400).");
    }
  });

  it("does not throw on a body that was already read", async () => {
    const response = json(500, { error: "late" });
    await response.text();
    expect(await readApiError(response, "Could not save")).toBe("Could not save (HTTP 500).");
  });
});
