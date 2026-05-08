import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  actionsForEvent,
  appendTrimmedLogs,
  hmacHex,
  normalizeMetricSummary,
  parseCallbackEvent,
  verifySignature,
} from "./callback.ts";

const RUN_ID = "00000000-0000-4000-8000-000000000001";

Deno.test("verifySignature accepts exact sha256 HMAC", async () => {
  const body = JSON.stringify({ type: "metric", run_id: RUN_ID, step: 1, name: "mAP50", value: 0.42 });
  const sig = await hmacHex("secret", body);
  assertEquals(await verifySignature("secret", body, `sha256=${sig}`), true);
});

Deno.test("normalizeMetricSummary maps Ultralytics metrics and preserves raw names", () => {
  assertEquals(normalizeMetricSummary({
    "metrics/mAP50(B)": 0.71,
    "metrics/mAP50-95(B)": 0.63,
    "metrics/precision(B)": 0.8,
    "metrics/recall(B)": 0.77,
    "metrics/mAP50(M)": 0.61,
    "metrics/mAP50-95(M)": 0.59,
  }), {
    raw: {
      "metrics/mAP50(B)": 0.71,
      "metrics/mAP50-95(B)": 0.63,
      "metrics/precision(B)": 0.8,
      "metrics/recall(B)": 0.77,
      "metrics/mAP50(M)": 0.61,
      "metrics/mAP50-95(M)": 0.59,
    },
    map50: 0.71,
    map5095: 0.63,
    precision: 0.8,
    recall: 0.77,
    maskMap50: 0.61,
    maskMap5095: 0.59,
  });
});

Deno.test("verifySignature rejects missing or mismatched signature", async () => {
  const body = "{}";
  assertEquals(await verifySignature("secret", body, null), false);
  assertEquals(await verifySignature("secret", body, "sha256=deadbeef"), false);
});

Deno.test("metric event maps to an insert_metric action", () => {
  const event = parseCallbackEvent({
    type: "metric",
    run_id: RUN_ID,
    step: 7,
    epoch: 2,
    name: "mask_map",
    value: 0.31,
  });
  assertEquals(actionsForEvent(event), [{
    kind: "insert_metric",
    runId: RUN_ID,
    step: 7,
    epoch: 2,
    name: "mask_map",
    value: 0.31,
  }]);
});

Deno.test("log appends are trimmed to the latest 500 lines", () => {
  const existing = { logs: Array.from({ length: 499 }, (_, i) => `old-${i}`), other: "kept" };
  const updated = appendTrimmedLogs(existing, ["new-a", "new-b", "new-c"]);
  const logs = updated.logs as string[];
  assertEquals(logs.length, 500);
  assertEquals(logs[0], "old-2");
  assertEquals(logs.at(-1), "new-c");
  assertEquals(updated.other, "kept");
});

Deno.test("succeeded event keeps artifact and metric payload for DB dispatch", () => {
  const event = parseCallbackEvent({
    type: "succeeded",
    run_id: RUN_ID,
    tflite_r2_key: "runs/x/model.tflite",
    mlmodel_r2_key: "runs/x/model.mlpackage.zip",
    mlmodel_size_bytes: 456,
    mlmodel_content_hash: "sha256:coreml",
    pytorch_r2_key: "runs/x/model.pt",
    pytorch_size_bytes: 789,
    pytorch_content_hash: "sha256:pytorch",
    size_bytes: 123,
    semver: "1.2.3",
    metrics: { map50: 0.7, ignored: "nope" },
  });
  assertEquals(actionsForEvent(event), [{
    kind: "mark_succeeded",
    runId: RUN_ID,
    event: {
      type: "succeeded",
      run_id: RUN_ID,
      tflite_r2_key: "runs/x/model.tflite",
      mlmodel_r2_key: "runs/x/model.mlpackage.zip",
      mlmodel_size_bytes: 456,
      mlmodel_content_hash: "sha256:coreml",
      pytorch_r2_key: "runs/x/model.pt",
      pytorch_size_bytes: 789,
      pytorch_content_hash: "sha256:pytorch",
      size_bytes: 123,
      content_hash: undefined,
      semver: "1.2.3",
      metrics: { map50: 0.7 },
    },
  }]);
});
