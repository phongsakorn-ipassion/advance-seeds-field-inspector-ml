import type { RegistryStore } from "./api";
import { createDemoStore } from "./demoStore";
import { createSupabaseStore } from "./supabaseStore";

export * from "./types";
export type { RegistryStore } from "./api";
export { defaultConfig, demoAdmin } from "./demoStore";

export function createRegistryStore(): RegistryStore {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const slug = import.meta.env.VITE_MODEL_LINE_SLUG ?? "seeds-poc";
  const quotaMb = Number(import.meta.env.VITE_STORAGE_QUOTA_MB ?? 32);
  if (url && key) {
    return createSupabaseStore({ supabaseUrl: url, supabaseAnonKey: key, modelLineSlug: slug, quotaMb });
  }
  return createDemoStore();
}
