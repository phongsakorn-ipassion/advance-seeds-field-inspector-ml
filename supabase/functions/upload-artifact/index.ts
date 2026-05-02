import { corsHeaders } from "../_shared/cors.ts";
import { presignPut } from "../_shared/r2.ts";

interface Body {
  kind: "tflite" | "mlmodel";
  run_id: string;
  semver: string;
}

Deno.serve(async (req) => {
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

  const ext = body.kind === "tflite" ? "tflite" : "mlmodel";
  const r2Key = `runs/${body.run_id}/${body.semver}.${ext}`;
  const uploadUrl = await presignPut(r2Key);
  return json({ upload_url: uploadUrl, r2_key: r2Key });
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
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.role === "service_role") return "service_role";
    if (payload.app_metadata?.role === "admin") return "admin";
    return payload.role ?? null;
  } catch { return null; }
}
