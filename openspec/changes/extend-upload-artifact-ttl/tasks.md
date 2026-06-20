## 1. Extend the upload PUT TTL

- [ ] 1.1 In `supabase/functions/upload-artifact/index.ts`, call `presignPut(key, contentType, { expiresIn: 3600 })` (explicit one hour).
- [ ] 1.2 Confirm `presignPut` in `_shared/r2.ts` accepts/forwards an `expiresIn` override (add the param if missing; keep the 900 s default for other callers).
- [ ] 1.3 Decide whether `upload-dataset` warrants the same bump (dataset ZIPs can be large) and apply if so.

## 2. Sync the spec

- [ ] 2.1 Update `openspec/specs/model-registry/spec.md`: PUT TTL "15-minute" → "one-hour"; remove the review TODO note.

## 3. Validate

- [ ] 3.1 `openspec validate extend-upload-artifact-ttl --strict`.
- [ ] 3.2 Edge Function tests pass; a large (>50 MB) artifact uploads on a throttled connection without URL expiry.
