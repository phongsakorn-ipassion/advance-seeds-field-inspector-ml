## ADDED Requirements

### Requirement: Dashboard uploads dataset image bundles
The dashboard SHALL allow an admin operator to upload a zipped dataset image bundle alongside the YOLO dataset YAML when creating a manual Colab training run.

#### Scenario: Operator attaches image bundle
- **WHEN** an admin uploads a dataset ZIP in the Train new model form
- **THEN** the dashboard SHALL upload the ZIP to R2 through an admin-authorized Edge Function
- **AND** the run config SHALL store the bundle R2 key, original filename, and byte size

#### Scenario: Operator uses manual image handoff
- **WHEN** no dataset ZIP is attached
- **THEN** the dashboard SHALL keep the existing manual Colab hand-off path available
