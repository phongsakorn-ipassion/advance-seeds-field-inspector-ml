import { corsHeaders } from "../_shared/cors.ts";
import { presignPut } from "../_shared/r2.ts";

interface Body {
  filename: string;
  model_line_slug: string;
  kind?: "yaml" | "zip";
  content_type?: string;
}

const SAFE = /^[A-Za-z0-9._-]+$/;

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

    const role = roleFromJwt(req.headers.get("authorization") ?? "");
    if (role !== "admin" && role !== "service_role") {
      return json({ error: "admin role required" }, 403);
    }

    let body: Body;
    try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
    if (!body.filename || !body.model_line_slug) {
      return json({ error: "filename and model_line_slug required" }, 400);
    }
    if (!SAFE.test(body.filename) || !SAFE.test(body.model_line_slug)) {
      return json({ error: "filename and model_line_slug must be [A-Za-z0-9._-]" }, 400);
    }
    const inferred: "yaml" | "zip" =
      body.kind ?? (body.filename.endsWith(".zip") ? "zip" : "yaml");
    if (inferred === "yaml" && !/\.ya?ml$/i.test(body.filename)) {
      return json({ error: "yaml uploads must end with .yaml or .yml" }, 400);
    }
    if (inferred === "zip" && !/\.zip$/i.test(body.filename)) {
      return json({ error: "zip uploads must end with .zip" }, 400);
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const r2_key = `datasets/${body.model_line_slug}/${stamp}/${body.filename}`;
    const contentType =
      body.content_type ??
      (inferred === "yaml"
        ? "application/yaml"
        : "application/zip");
    const upload_url = await presignPut(r2_key, contentType);
    return json({ upload_url, r2_key, kind: inferred });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("upload-dataset failed:", message);
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
