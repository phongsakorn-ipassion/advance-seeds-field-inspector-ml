import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const FN = "http://127.0.0.1:54321/functions/v1/storage-usage";
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function get(path: string, jwt: string): Promise<Response> {
  return await fetch(`${FN}${path}`, {
    headers: { Authorization: `Bearer ${jwt}`, apikey: ANON },
  });
}

async function post(path: string, body: unknown, jwt: string): Promise<Response> {
  return await fetch(`${FN}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: ANON,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

Deno.test("GET / returns usage shape", async () => {
  const r = await get("", SERVICE);
  assertEquals(r.status, 200);
  const body = await r.json();
  if (typeof body.used_bytes !== "number" || typeof body.quota_bytes !== "number") {
    throw new Error("expected used_bytes/quota_bytes numbers, got: " + JSON.stringify(body));
  }
});

Deno.test("POST /delete is rejected for anon", async () => {
  const r = await post("/delete", { version_id: "00000000-0000-0000-0000-000000000000" }, ANON);
  await r.body?.cancel();
  assertEquals(r.status, 403);
});

Deno.test("POST /delete returns 404 for unknown version (service role)", async () => {
  const r = await post("/delete", { version_id: "00000000-0000-0000-0000-000000000000" }, SERVICE);
  await r.body?.cancel();
  assertEquals(r.status, 404);
});
