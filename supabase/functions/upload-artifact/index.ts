import { corsHeaders } from "../_shared/cors.ts";
import { presignPut } from "../_shared/r2.ts";

interface Body {
  kind: "tflite" | "mlmodel" | "coreml";
  run_id: string;
  semver: string;
  content_type?: string;
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

    const role = roleFromJwt(req.headers.get("authorization") ?? "");
    if (role !== "service_role" && role !== "admin") {
      return json({ error: "unauthorized" }, 401);
    }

    let body: Body;
    try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
    if (!body.kind || !body.run_id || !body.semver) {
      return json({ error: "kind, run_id, semver required" }, 400);
    }
    const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;
    if (!SAFE_SEGMENT.test(body.run_id) || !SAFE_SEGMENT.test(body.semver)) {
      return json({ error: "invalid run_id or semver" }, 400);
    }

    const ext = body.kind === "tflite" ? "tflite" : "mlpackage.zip";
    const r2Key = `runs/${body.run_id}/${body.semver}.${ext}`;
    const uploadUrl = await presignPut(r2Key, body.content_type ?? "application/octet-stream");
    return json({ upload_url: uploadUrl, r2_key: r2Key });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("upload-artifact failed:", message);
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
