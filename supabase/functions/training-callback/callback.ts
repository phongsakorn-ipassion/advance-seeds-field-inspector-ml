export type CallbackEvent =
  | {
      type: "metric";
      run_id: string;
      step: number;
      epoch?: number | null;
      name: string;
      value: number;
    }
  | {
      type: "log";
      run_id: string;
      lines: string[];
    }
  | {
      type: "succeeded";
      run_id: string;
      tflite_r2_key: string;
      mlmodel_r2_key?: string | null;
      mlmodel_size_bytes?: number | null;
      mlmodel_content_hash?: string | null;
      size_bytes: number;
      content_hash?: string;
      semver?: string;
      metrics?: Record<string, number>;
    }
  | {
      type: "failed";
      run_id: string;
      error: string;
    };

export type CallbackAction =
  | { kind: "insert_metric"; runId: string; step: number; epoch: number | null; name: string; value: number }
  | { kind: "append_logs"; runId: string; lines: string[] }
  | { kind: "mark_succeeded"; runId: string; event: Extract<CallbackEvent, { type: "succeeded" }> }
  | { kind: "mark_failed"; runId: string; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifySignature(secret: string, body: string, header: string | null): Promise<boolean> {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = await hmacHex(secret, body);
  return timingSafeEqual(expected, header.slice("sha256=".length));
}

export function parseCallbackEvent(value: unknown): CallbackEvent {
  if (!value || typeof value !== "object") throw new Error("event must be an object");
  const event = value as Record<string, unknown>;
  const runId = stringField(event, "run_id");
  if (!UUID.test(runId)) throw new Error("run_id must be a uuid");

  switch (event.type) {
    case "metric": {
      const step = numberField(event, "step");
      const epoch = optionalNumberField(event, "epoch");
      const name = stringField(event, "name");
      const value = numberField(event, "value");
      return { type: "metric", run_id: runId, step, epoch, name, value };
    }
    case "log": {
      if (!Array.isArray(event.lines) || event.lines.some((line) => typeof line !== "string")) {
        throw new Error("lines must be a string array");
      }
      return { type: "log", run_id: runId, lines: event.lines.slice(0, 100) as string[] };
    }
    case "succeeded": {
      const tflite = stringField(event, "tflite_r2_key");
      const sizeBytes = numberField(event, "size_bytes");
      const metrics = event.metrics && typeof event.metrics === "object"
        ? Object.fromEntries(
          Object.entries(event.metrics as Record<string, unknown>)
            .filter(([, v]) => typeof v === "number"),
        ) as Record<string, number>
        : undefined;
      return {
        type: "succeeded",
        run_id: runId,
        tflite_r2_key: tflite,
        mlmodel_r2_key: typeof event.mlmodel_r2_key === "string" ? event.mlmodel_r2_key : null,
        mlmodel_size_bytes: typeof event.mlmodel_size_bytes === "number" ? event.mlmodel_size_bytes : null,
        mlmodel_content_hash: typeof event.mlmodel_content_hash === "string" ? event.mlmodel_content_hash : null,
        size_bytes: sizeBytes,
        content_hash: typeof event.content_hash === "string" ? event.content_hash : undefined,
        semver: typeof event.semver === "string" ? event.semver : undefined,
        metrics,
      };
    }
    case "failed":
      return { type: "failed", run_id: runId, error: stringField(event, "error") };
    default:
      throw new Error("unsupported callback type");
  }
}

export function actionsForEvent(event: CallbackEvent): CallbackAction[] {
  switch (event.type) {
    case "metric":
      return [{
        kind: "insert_metric",
        runId: event.run_id,
        step: event.step,
        epoch: event.epoch ?? null,
        name: event.name,
        value: event.value,
      }];
    case "log":
      return [{ kind: "append_logs", runId: event.run_id, lines: event.lines }];
    case "succeeded":
      return [{ kind: "mark_succeeded", runId: event.run_id, event }];
    case "failed":
      return [{ kind: "mark_failed", runId: event.run_id, error: event.error }];
  }
}

export function appendTrimmedLogs(existing: unknown, lines: string[]): Record<string, unknown> {
  const base = existing && typeof existing === "object" && !Array.isArray(existing)
    ? { ...(existing as Record<string, unknown>) }
    : {};
  const prev = Array.isArray(base.logs) ? base.logs.filter((line) => typeof line === "string") as string[] : [];
  base.logs = [...prev, ...lines].slice(-500);
  return base;
}

function stringField(event: Record<string, unknown>, key: string): string {
  const value = event[key];
  if (typeof value !== "string" || value.length === 0) throw new Error(`${key} required`);
  return value;
}

function numberField(event: Record<string, unknown>, key: string): number {
  const value = event[key];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${key} must be a number`);
  return value;
}

function optionalNumberField(event: Record<string, unknown>, key: string): number | null {
  if (event[key] === undefined || event[key] === null) return null;
  return numberField(event, key);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
