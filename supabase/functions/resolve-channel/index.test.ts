import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const FN = "http://127.0.0.1:54321/functions/v1/resolve-channel";
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

async function call(qs: string): Promise<Response> {
  return await fetch(`${FN}?${qs}`, {
    headers: { Authorization: `Bearer ${ANON}`, apikey: ANON },
  });
}

Deno.test("returns update when client has no current_version", async () => {
  const r = await call("channel=staging&model_line=seeds-poc&current_compat=&current_version=");
  assertEquals(r.status, 200);
  const body = await r.json();
  assertEquals(body.action, "update");
  assertEquals(body.semver, "1.0.0");
  if (typeof body.model_url !== "string") {
    throw new Error("expected signed model_url");
  }
});

Deno.test("returns rebuild_required on compat mismatch", async () => {
  const r = await call(
    "channel=staging&model_line=seeds-poc&current_compat=deadbeef&current_version=",
  );
  assertEquals(r.status, 200);
  const body = await r.json();
  assertEquals(body.action, "rebuild_required");
  assertEquals(body.reason, "compat_signature_changed");
});

Deno.test("returns noop when client already on current version", async () => {
  const first = await (await call(
    "channel=staging&model_line=seeds-poc&current_compat=&current_version=",
  )).json();
  const r = await call(
    `channel=staging&model_line=seeds-poc&current_compat=&current_version=${first.version_id}`,
  );
  const body = await r.json();
  assertEquals(body.action, "noop");
});

Deno.test("returns noop when channel is unset", async () => {
  const r = await call("channel=production&model_line=seeds-poc&current_compat=&current_version=");
  const body = await r.json();
  assertEquals(body.action, "noop");
  assertEquals(body.reason, "channel_unset");
});
