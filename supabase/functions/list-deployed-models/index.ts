import { corsHeaders } from "../_shared/cors.ts";
import { presignGet } from "../_shared/r2.ts";
import { serviceClient } from "../_shared/supabase.ts";

type Platform = "android" | "ios";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "method not allowed" }, 405);

  const url = new URL(req.url);
  const channel = url.searchParams.get("channel") ?? "";
  const modelLine = url.searchParams.get("model_line") ?? "";
  const platform = (url.searchParams.get("platform") ?? "android") as Platform;
  const readyOnly = url.searchParams.get("ready_only") === "true";
  if (!["staging", "production"].includes(channel)) return json({ error: "invalid channel" }, 400);
  if (!modelLine) return json({ error: "model_line required" }, 400);
  if (!["android", "ios"].includes(platform)) return json({ error: "invalid platform" }, 400);

  const sb = serviceClient();
  const { data: line } = await sb.from("model_lines").select("id, slug").eq("slug", modelLine).maybeSingle();
  if (!line) return json({ error: "unknown model_line" }, 404);

  const { data: deployments, error } = await sb
    .from("channel_deployments")
    .select("id, channel_name, version_id, is_default, deployed_at, versions(id, semver, compat_signature, metadata, tflite_r2_key, mlmodel_r2_key, size_bytes, content_hash, created_at)")
    .eq("model_line_id", line.id)
    .eq("channel_name", channel)
    .eq("status", "active")
    .order("is_default", { ascending: false })
    .order("deployed_at", { ascending: false });
  if (error) return json({ error: error.message }, 500);

  const models = [];
  for (const deployment of deployments ?? []) {
    const version = Array.isArray(deployment.versions) ? deployment.versions[0] : deployment.versions;
    if (!version) continue;
    const key = platform === "ios" ? version.mlmodel_r2_key : version.tflite_r2_key;
    if (!key) {
      if (!readyOnly) {
        models.push({
          deployment_id: deployment.id,
          version_id: version.id,
          semver: version.semver,
          platform,
          is_default: deployment.is_default,
          status: "artifact_missing",
          metadata: version.metadata,
        });
      }
      continue;
    }
    models.push({
      deployment_id: deployment.id,
      version_id: version.id,
      semver: version.semver,
      platform,
      is_default: deployment.is_default,
      status: "ready",
      artifact_kind: platform === "ios" ? "coreml" : "tflite",
      artifact_url: await presignGet(key, 3600),
      r2_key: key,
      content_hash: platform === "ios"
        ? version.metadata?.artifacts?.coreml?.content_hash ?? null
        : version.content_hash,
      size_bytes: platform === "ios"
        ? version.metadata?.artifacts?.coreml?.size_bytes ?? null
        : version.size_bytes,
      compat_signature: version.compat_signature,
      metadata: version.metadata,
    });
  }

  return json({ model_line: modelLine, channel, platform, models });
});

function json(b: unknown, status = 200): Response {
  return new Response(JSON.stringify(b), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}
