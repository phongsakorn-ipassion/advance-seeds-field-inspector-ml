import { corsHeaders } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { presignGet } from "../_shared/r2.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const url = new URL(req.url);
  const channel = url.searchParams.get("channel") ?? "";
  const lineSlug = url.searchParams.get("model_line") ?? "";
  const currentCompat = url.searchParams.get("current_compat") ?? "";
  const currentVersion = url.searchParams.get("current_version") ?? "";
  const platform = url.searchParams.get("platform") ?? "android";

  if (!channel || !lineSlug) {
    return json({ error: "channel and model_line required" }, 400);
  }
  if (!["android", "ios"].includes(platform)) return json({ error: "invalid platform" }, 400);

  const sb = serviceClient();
  const { data: line } = await sb
    .from("model_lines").select("id").eq("slug", lineSlug).maybeSingle();
  if (!line) return json({ error: "unknown model_line" }, 404);

  const { data: ch } = await sb
    .from("channels")
    .select("current_version_id")
    .eq("model_line_id", line.id).eq("name", channel).maybeSingle();
  if (!ch) return json({ error: "unknown channel" }, 404);
  if (!ch.current_version_id) return json({ action: "noop", reason: "channel_unset" });

  const { data: v } = await sb
    .from("versions")
    .select("id, semver, compat_signature, metadata, tflite_r2_key, mlmodel_r2_key, size_bytes, content_hash")
    .eq("id", ch.current_version_id).maybeSingle();
  if (!v) return json({ error: "current_version_id stale" }, 500);

  if (currentCompat && currentCompat !== v.compat_signature) {
    return json({
      action: "rebuild_required",
      reason: "compat_signature_changed",
      expected_compat: v.compat_signature,
      current_compat: currentCompat,
    });
  }
  if (currentVersion === v.id) return json({ action: "noop" });

  const r2Key = platform === "ios" ? v.mlmodel_r2_key : v.tflite_r2_key;
  if (!r2Key) {
    return json({
      action: "artifact_missing",
      platform,
      version_id: v.id,
      semver: v.semver,
      metadata: v.metadata,
    });
  }
  let modelUrl: string;
  try {
    modelUrl = await presignGet(r2Key, 3600);
  } catch (e) {
    console.error("presignGet failed:", e);
    return json({ error: "artifact unavailable" }, 503);
  }
  return json({
    action: "update",
    version_id: v.id,
    semver: v.semver,
    platform,
    artifact_kind: platform === "ios" ? "coreml" : "tflite",
    model_url: modelUrl,
    metadata: v.metadata,
    content_hash: platform === "ios" ? v.metadata?.artifacts?.coreml?.content_hash ?? null : v.content_hash,
    size_bytes: platform === "ios" ? v.metadata?.artifacts?.coreml?.size_bytes ?? null : v.size_bytes,
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}
