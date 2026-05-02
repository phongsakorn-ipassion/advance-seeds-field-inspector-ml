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
