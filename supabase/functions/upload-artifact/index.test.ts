import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const FN = "http://127.0.0.1:54321/functions/v1/upload-artifact";
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function post(body: unknown, jwt: string): Promise<Response> {
  return await fetch(FN, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: ANON,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

Deno.test("anon caller is rejected", async () => {
  const r = await post({ kind: "tflite", run_id: "x" }, ANON);
  await r.body?.cancel();
  assertEquals(r.status, 401);
});

Deno.test("service-role caller gets a signed PUT URL", async () => {
  const r = await post(
    { kind: "tflite", run_id: "00000000-0000-0000-0000-0000000000aa", semver: "1.1.0" },
    SERVICE,
  );
  assertEquals(r.status, 200);
  const body = await r.json();
  if (typeof body.upload_url !== "string" || !body.upload_url.includes("X-Amz-Signature")) {
    throw new Error("expected presigned PUT URL, got: " + JSON.stringify(body));
  }
  assertEquals(typeof body.r2_key, "string");
});
