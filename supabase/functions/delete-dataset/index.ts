import { corsHeaders } from "../_shared/cors.ts";
import { deleteObject } from "../_shared/r2.ts";

interface Body {
  r2_key: string;
}

const KEY_PATTERN = /^datasets\/[A-Za-z0-9._-]+\/[A-Za-z0-9._\-:T]+\/[A-Za-z0-9._-]+\.zip$/i;

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

    const role = roleFromJwt(req.headers.get("authorization") ?? "");
    if (role !== "admin" && role !== "service_role") {
      return json({ error: "admin or service_role required" }, 403);
    }

    let body: Body;
    try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
    if (!body.r2_key || typeof body.r2_key !== "string") {
      return json({ error: "r2_key required" }, 400);
    }
    if (!KEY_PATTERN.test(body.r2_key)) {
      return json({ error: "r2_key must look like datasets/<line>/<stamp>/<file>.zip" }, 400);
    }

    await deleteObject(body.r2_key);
    return json({ deleted: body.r2_key });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("delete-dataset failed:", message);
    return json({ error: message }, 500);
  }
});

function json(b: unknown, status = 200): Response {
  return new Response(JSON.stringify(b), {
    status, headers: { "content-type": "application/json", ...corsHeaders },
  });
}

function roleFromJwt(authHeader: string): string | null {
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const raw = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = raw + "=".repeat((4 - raw.length % 4) % 4);
    const payload = JSON.parse(atob(padded));
    if (payload.role === "service_role") return "service_role";
    if (payload.app_metadata?.role === "admin") return "admin";
    return payload.role ?? null;
  } catch { return null; }
}
