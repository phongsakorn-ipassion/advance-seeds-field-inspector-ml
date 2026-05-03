import { corsHeaders } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import {
  appendTrimmedLogs,
  parseCallbackEvent,
  verifySignature,
  type CallbackEvent,
} from "./callback.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const secret = Deno.env.get("TRAINING_CALLBACK_SECRET") ?? "";
  const bodyText = await req.text();
  if (!await verifySignature(secret, bodyText, req.headers.get("x-training-signature"))) {
    return json({ error: "invalid signature" }, 401);
  }

  let event: CallbackEvent;
  try {
    event = parseCallbackEvent(JSON.parse(bodyText));
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "invalid payload" }, 400);
  }

  try {
    await applyEvent(event);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
  return json({ ok: true });
});

async function applyEvent(event: CallbackEvent): Promise<void> {
  const sb = serviceClient();
  if (event.type === "metric") {
    const { error } = await sb.from("run_metrics").insert({
      run_id: event.run_id,
      step: event.step,
      epoch: event.epoch ?? null,
      name: event.name,
      value: event.value,
    });
    if (error) throw error;
    return;
  }

  if (event.type === "log") {
    await appendLogs(event.run_id, event.lines);
    return;
  }

  if (event.type === "failed") {
    await appendLogs(event.run_id, [`Training failed: ${event.error}`]);
    const { error } = await sb.from("runs").update({
      status: "failed",
      finished_at: new Date().toISOString(),
    }).eq("id", event.run_id);
    if (error) throw error;
    return;
  }

  const { data: run, error: runErr } = await sb
    .from("runs")
    .select("id, model_line_id, config_yaml")
    .eq("id", event.run_id)
    .single();
  if (runErr || !run) throw new Error(runErr?.message ?? "run not found");

  const cfg = run.config_yaml ?? {};
  const hp = cfg.hyperparameters ?? {};
  const metrics = event.metrics ?? {};
  const semver = event.semver ?? inferSemver();
  const contentHash = event.content_hash ?? await sha256Hex(event.tflite_r2_key);
  const metadata = {
    dataset: cfg.dataset ?? "",
    source_weights: cfg.source_weights ?? "",
    class_names: cfg.classes ?? cfg.class_names ?? [],
    hyperparameters: hp,
    input_size: hp.imgsz ?? 640,
    output_kind: "segmentation-mask",
    task: "segmentation",
    metrics,
    artifacts: {
      tflite: {
        r2_key: event.tflite_r2_key,
        size_bytes: event.size_bytes,
        content_hash: contentHash,
      },
      ...(event.mlmodel_r2_key
        ? {
          coreml: {
            r2_key: event.mlmodel_r2_key,
            size_bytes: event.mlmodel_size_bytes,
            content_hash: event.mlmodel_content_hash,
            packaging: "mlpackage.zip",
          },
        }
        : {}),
    },
  };

  const { error: versionErr } = await sb.from("versions").insert({
    run_id: event.run_id,
    model_line_id: run.model_line_id,
    semver,
    metadata,
    tflite_r2_key: event.tflite_r2_key,
    mlmodel_r2_key: event.mlmodel_r2_key ?? null,
    size_bytes: event.size_bytes,
    content_hash: contentHash,
  });
  if (versionErr) throw versionErr;

  await appendLogs(event.run_id, [`Training succeeded. Artifact: ${event.tflite_r2_key}`]);
  const { error: updateErr } = await sb.from("runs").update({
    status: "succeeded",
    finished_at: new Date().toISOString(),
  }).eq("id", event.run_id);
  if (updateErr) throw updateErr;
}

async function appendLogs(runId: string, lines: string[]): Promise<void> {
  const sb = serviceClient();
  const { data: run, error: fetchErr } = await sb
    .from("runs")
    .select("config_yaml")
    .eq("id", runId)
    .single();
  if (fetchErr || !run) throw new Error(fetchErr?.message ?? "run not found");
  const nextConfig = appendTrimmedLogs(run.config_yaml, lines);
  const { error } = await sb.from("runs").update({ config_yaml: nextConfig }).eq("id", runId);
  if (error) throw error;
}

function inferSemver(): string {
  const d = new Date();
  const patch = d.getUTCDate().toString().padStart(2, "0") + d.getUTCHours().toString().padStart(2, "0");
  return `0.${d.getUTCMonth() + 1}.${patch}`;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(b: unknown, status = 200): Response {
  return new Response(JSON.stringify(b), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}
