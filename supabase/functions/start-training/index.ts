import { corsHeaders } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";

type Body = {
  model_line_slug: string;
  config: Record<string, unknown>;
};

const SAFE_SLUG = /^[A-Za-z0-9._-]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const role = roleFromJwt(req.headers.get("authorization") ?? "");
  if (role !== "admin" && role !== "service_role") {
    return json({ error: "admin role required" }, 403);
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  if (!body.model_line_slug || !SAFE_SLUG.test(body.model_line_slug) || !body.config || typeof body.config !== "object") {
    return json({ error: "model_line_slug and config required" }, 400);
  }

  const providerBaseUrl = Deno.env.get("TRAINING_PROVIDER_BASE_URL");
  const providerApiKey = Deno.env.get("TRAINING_PROVIDER_API_KEY");
  const callbackSecret = Deno.env.get("TRAINING_CALLBACK_SECRET");
  if (!providerBaseUrl || !providerApiKey || !callbackSecret) {
    return json({ error: "hosted_training_not_configured" }, 503);
  }

  const sb = serviceClient();
  const { data: line, error: lineErr } = await sb
    .from("model_lines")
    .select("id, slug")
    .eq("slug", body.model_line_slug)
    .single();
  if (lineErr || !line) return json({ error: lineErr?.message ?? "model line not found" }, 404);

  const runName = runNameFromConfig(body.config);
  const logs = [
    `Run dispatched by dashboard for model_line=${body.model_line_slug}`,
    `Provider: hosted GPU`,
    `Source weights: ${stringValue(body.config.source_weights ?? body.config.sourceWeights)}`,
    `Dataset: ${stringValue(body.config.dataset)}`,
    "Awaiting hosted worker metrics...",
  ];
  const config = {
    ...body.config,
    name: runName,
    model_line: body.model_line_slug,
    logs,
  };

  const { data: run, error: insertErr } = await sb.from("runs").insert({
    model_line_id: line.id,
    status: "running",
    config_yaml: config,
    hardware: { label: "Hosted GPU" },
  }).select("id").single();
  if (insertErr || !run) return json({ error: insertErr?.message ?? "run insert failed" }, 500);

  const callbackUrl = new URL(req.url);
  callbackUrl.pathname = callbackUrl.pathname.replace(/\/start-training$/, "/training-callback");

  let providerJobId: string;
  try {
    providerJobId = await dispatchProvider(providerBaseUrl, providerApiKey, {
      run_id: run.id,
      config,
      callback_url: callbackUrl.toString(),
      callback_secret: callbackSecret,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await sb.from("runs").update({
      status: "failed",
      finished_at: new Date().toISOString(),
      config_yaml: { ...config, logs: [...logs, `Provider dispatch failed: ${message}`] },
    }).eq("id", run.id);
    return json({ error: message, run_id: run.id }, 502);
  }

  const { error: updateErr } = await sb.from("runs")
    .update({ provider_job_id: providerJobId })
    .eq("id", run.id);
  if (updateErr) return json({ error: updateErr.message, run_id: run.id }, 500);
  return json({ run_id: run.id, provider_job_id: providerJobId }, 202);
});

async function dispatchProvider(baseUrl: string, apiKey: string, payload: unknown): Promise<string> {
  const url = new URL("/runs", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`provider ${res.status}: ${text}`);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error("provider returned invalid json");
  }
  const jobId = body.provider_job_id ?? body.job_id ?? body.id;
  if (typeof jobId !== "string" || jobId.length === 0) {
    throw new Error("provider response missing provider_job_id");
  }
  return jobId;
}

function runNameFromConfig(config: Record<string, unknown>): string {
  const dataset = stringValue(config.dataset);
  const last = dataset.split("/").filter(Boolean).at(-1) ?? "hosted-run";
  const base = last.replace(/\.ya?ml$/i, "");
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${base}-${stamp}`;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function json(b: unknown, status = 200): Response {
  return new Response(JSON.stringify(b), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
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
  } catch {
    return null;
  }
}
