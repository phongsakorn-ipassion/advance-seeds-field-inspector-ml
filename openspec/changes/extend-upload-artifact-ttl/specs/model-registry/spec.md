## MODIFIED Requirements

### Requirement: Artifact uploads require admin
The `upload-artifact` function SHALL reject callers without the `admin` role, and SHALL return a **one-hour** R2 signed PUT URL otherwise. The one-hour TTL is sized for large artifact uploads (tens of MB TFLite / Core ML / PyTorch files) on slow or interrupted connections.

#### Scenario: Anonymous upload is rejected
- **WHEN** an anonymous client calls `upload-artifact`
- **THEN** the request SHALL be rejected with an unauthorized response

#### Scenario: Admin receives a one-hour signed PUT URL
- **GIVEN** an admin-authenticated caller requests an artifact upload URL
- **WHEN** `upload-artifact` returns the presigned PUT URL
- **THEN** the URL TTL SHALL be one hour (3600 s), not the 900 s default
