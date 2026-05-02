import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeCompatSignature } from "./compat.ts";

Deno.test("compat signature matches the SQL canonical form", async () => {
  const sig = await computeCompatSignature({
    class_names: ["apple","apple_spot","banana","banana_spot","orange","orange_spot"],
    input_size: 640,
    output_kind: "end2end_nms_free",
    task: "segment",
  });
  // Computed once via psql:
  //   SELECT public.compute_compat_signature(...);
  // Recorded here so any drift between TS and SQL fails this test.
  assertEquals(
    sig,
    "0256a1435c9aa3f4761eb9028999e8eb0af61726ac0d087b3610b8ea5f1a28d1",
  );
});
