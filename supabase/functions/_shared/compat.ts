export interface CompatInput {
  class_names: string[];
  input_size: number;
  output_kind: string;
  task: string;
}

export async function computeCompatSignature(input: CompatInput): Promise<string> {
  // Postgres to_jsonb(array)::text serializes arrays with a space after each comma,
  // e.g. ["a", "b"] — we must match that format exactly.
  const classNamesJson =
    "[" + input.class_names.map((s) => JSON.stringify(s)).join(", ") + "]";
  const canonical =
    `{"class_names":${classNamesJson}` +
    `,"input_size":${input.input_size}` +
    `,"output_kind":${JSON.stringify(input.output_kind)}` +
    `,"task":${JSON.stringify(input.task)}}`;
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
