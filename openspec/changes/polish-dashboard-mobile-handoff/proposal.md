## Why
Operators and mobile developers need cleaner model lifecycle screens and a concrete API handoff for consuming deployed models. Some dashboard cards still expose low-value implementation details, such as dataset paths and artifact keys, directly in dense layouts.

## What Changes
- Simplify dataset and model cards by removing noisy config/path/size labels.
- Move model description before deployment context.
- Keep artifact keys discoverable through info icons instead of occupying card body space.
- Add Postman collection and API usage instructions for mobile-facing registry endpoints.
- Add storage-row navigation to model detail.

## Impact
- UI-only dashboard refinements plus docs.
- No database schema changes.
- No new secrets in client code.
