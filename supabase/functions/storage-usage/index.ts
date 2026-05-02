import { corsHeaders } from "../_shared/cors.ts";
import { deleteObject } from "../_shared/r2.ts";
import { serviceClient } from "../_shared/supabase.ts";

interface DeleteBody {
  version_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/storage-usage/, "");

  if (req.method === "GET" && (path === "" || path === "/")) {
    return await handleUsage();
  }
  if (req.method === "POST" && path === "/delete") {
    const role = roleFromJwt(req.headers.get("authorization") ?? "");
    if (role !== "admin" && role !== "service_role") {
      return json({ error: "admin role required" }, 403);
    }
    let body: DeleteBody;
    try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
    if (!body.version_id) return json({ error: "version_id required" }, 400);
    return await handleDelete(body.version_id);
  }

  return json({ error: "not found" }, 404);
});

async function handleUsage(): Promise<Response> {
  const sb = serviceClient();
  const { data, error } = await sb
    .from("versions")
    .select("size_bytes");
  if (error) return json({ error: error.message }, 500);
  const used = (data ?? []).reduce((sum, row) => sum + (row.size_bytes ?? 0), 0);
  const quota = Number(Deno.env.get("STORAGE_QUOTA_BYTES") ?? 32 * 1024 * 1024);
  return json({ used_bytes: used, quota_bytes: quota });
}

async function handleDelete(versionId: string): Promise<Response> {
  const sb = serviceClient();
  const { data: version, error } = await sb
    .from("versions")
    .select("id, tflite_r2_key, mlmodel_r2_key")
    .eq("id", versionId)
    .single();
  if (error || !version) return json({ error: "version not found" }, 404);

  // Refuse to delete a version that is still attached to a channel.
  const { data: refs, error: chErr } = await sb
    .from("channels")
    .select("id, name")
    .eq("current_version_id", versionId);
  if (chErr) return json({ error: chErr.message }, 500);
  if ((refs ?? []).length > 0) {
    return json({ error: "version is attached to a channel; undeploy first" }, 409);
  }

  try {
    if (version.tflite_r2_key) await deleteObject(version.tflite_r2_key);
    if (version.mlmodel_r2_key) await deleteObject(version.mlmodel_r2_key);
  } catch (err) {
    return json({ error: `r2 delete failed: ${err instanceof Error ? err.message : String(err)}` }, 502);
  }

  const { error: delErr } = await sb.from("versions").delete().eq("id", versionId);
  if (delErr) return json({ error: delErr.message }, 500);
  return json({ deleted: versionId });
}

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
