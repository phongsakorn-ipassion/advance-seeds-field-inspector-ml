import { corsHeaders } from "../_shared/cors.ts";
import { deleteObject } from "../_shared/r2.ts";
import { serviceClient } from "../_shared/supabase.ts";

interface DeleteBody {
  version_id: string;
}

type JwtClaims = {
  role: string | null;
  sub: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/storage-usage/, "");

  if (req.method === "GET" && (path === "" || path === "/")) {
    return await handleUsage();
  }
  if (req.method === "POST" && path === "/delete") {
    const claims = claimsFromJwt(req.headers.get("authorization") ?? "");
    if (claims.role !== "admin" && claims.role !== "service_role") {
      return json({ error: "admin role required" }, 403);
    }
    let body: DeleteBody;
    try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
    if (!body.version_id) return json({ error: "version_id required" }, 400);
    return await handleDelete(body.version_id);
  }
  if (req.method === "POST" && path === "/archive") {
    const claims = claimsFromJwt(req.headers.get("authorization") ?? "");
    if (claims.role !== "admin" && claims.role !== "service_role") {
      return json({ error: "admin role required" }, 403);
    }
    let body: DeleteBody;
    try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
    if (!body.version_id) return json({ error: "version_id required" }, 400);
    return await handleArchive(body.version_id, claims.sub);
  }

  return json({ error: "not found" }, 404);
});

async function handleUsage(): Promise<Response> {
  const sb = serviceClient();
  const { data, error } = await sb
    .from("versions")
    .select("size_bytes, metadata");
  if (error) return json({ error: error.message }, 500);
  const used = (data ?? []).reduce((sum, row) => isArchivedMetadata(row.metadata) ? sum : sum + (row.size_bytes ?? 0), 0);
  const quota = Number(Deno.env.get("STORAGE_QUOTA_BYTES") ?? 512 * 1024 * 1024);
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

  const { data: deployments, error: depErr } = await sb
    .from("channel_deployments")
    .select("id, channel_name")
    .eq("version_id", versionId)
    .eq("status", "active");
  if (depErr && depErr.code !== "42P01") return json({ error: depErr.message }, 500);
  if ((deployments ?? []).length > 0) {
    return json({ error: "version is deployed; undeploy it before archiving" }, 409);
  }

  try {
    if (version.tflite_r2_key) await deleteObject(version.tflite_r2_key);
    if (version.mlmodel_r2_key) await deleteObject(version.mlmodel_r2_key);
  } catch (err) {
    return json({ error: `r2 delete failed: ${err instanceof Error ? err.message : String(err)}` }, 502);
  }

  const { error: fromHistoryErr } = await sb
    .from("channel_history")
    .update({ from_version_id: null })
    .eq("from_version_id", versionId);
  if (fromHistoryErr) return json({ error: fromHistoryErr.message }, 500);

  const { error: toHistoryErr } = await sb
    .from("channel_history")
    .update({ to_version_id: null })
    .eq("to_version_id", versionId);
  if (toHistoryErr) return json({ error: toHistoryErr.message }, 500);

  const { error: delErr } = await sb.from("versions").delete().eq("id", versionId);
  if (delErr) return json({ error: delErr.message }, 500);
  return json({ deleted: versionId });
}

async function handleArchive(versionId: string, archivedBy: string | null): Promise<Response> {
  const sb = serviceClient();
  const { data: version, error } = await sb
    .from("versions")
    .select("id, tflite_r2_key, mlmodel_r2_key, size_bytes, content_hash, metadata")
    .eq("id", versionId)
    .single();
  if (error || !version) return json({ error: "version not found" }, 404);
  if (isArchivedMetadata(version.metadata)) return json({ archived: versionId, already_archived: true });

  const { data: refs, error: chErr } = await sb
    .from("channels")
    .select("id, name")
    .eq("current_version_id", versionId);
  if (chErr) return json({ error: chErr.message }, 500);
  if ((refs ?? []).length > 0) {
    return json({ error: "version is attached to a channel; undeploy first" }, 409);
  }

  const { data: deployments, error: depErr } = await sb
    .from("channel_deployments")
    .select("id, channel_name")
    .eq("version_id", versionId)
    .eq("status", "active");
  if (depErr && depErr.code !== "42P01") return json({ error: depErr.message }, 500);
  if ((deployments ?? []).length > 0) {
    return json({ error: "version is deployed; undeploy it before archiving" }, 409);
  }

  try {
    if (version.tflite_r2_key) await deleteObject(version.tflite_r2_key);
    if (version.mlmodel_r2_key) await deleteObject(version.mlmodel_r2_key);
  } catch (err) {
    return json({ error: `r2 delete failed: ${err instanceof Error ? err.message : String(err)}` }, 502);
  }

  const archivedAt = new Date().toISOString();
  const metadata = version.metadata && typeof version.metadata === "object" ? version.metadata : {};
  const nextMetadata = {
    ...metadata,
    archived_at: archivedAt,
    archived_by: archivedBy,
    artifacts_deleted_at: archivedAt,
    archived_artifacts: {
      tflite_r2_key: version.tflite_r2_key,
      mlmodel_r2_key: version.mlmodel_r2_key,
      size_bytes: version.size_bytes,
      content_hash: version.content_hash,
    },
  };
  const { error: updateErr } = await sb
    .from("versions")
    .update({ metadata: nextMetadata })
    .eq("id", versionId);
  if (updateErr) return json({ error: updateErr.message }, 500);
  return json({ archived: versionId });
}

function isArchivedMetadata(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  const md = metadata as Record<string, unknown>;
  return Boolean(md.archived_at ?? md.artifacts_deleted_at ?? md.artifacts_archived_at);
}

function json(b: unknown, status = 200): Response {
  return new Response(JSON.stringify(b), {
    status, headers: { "content-type": "application/json", ...corsHeaders },
  });
}

function claimsFromJwt(authHeader: string): JwtClaims {
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return { role: null, sub: null };
  const parts = token.split(".");
  if (parts.length !== 3) return { role: null, sub: null };
  try {
    const raw = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = raw + "=".repeat((4 - raw.length % 4) % 4);
    const payload = JSON.parse(atob(padded));
    const role = payload.role === "service_role" ? "service_role" : payload.app_metadata?.role === "admin" ? "admin" : payload.role ?? null;
    return { role, sub: typeof payload.sub === "string" ? payload.sub : null };
  } catch { return { role: null, sub: null }; }
}
