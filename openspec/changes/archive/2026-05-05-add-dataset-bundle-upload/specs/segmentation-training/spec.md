## ADDED Requirements

### Requirement: Colab training consumes dataset bundles
The Colab training flow SHALL automatically download and extract an attached dataset image bundle before starting Ultralytics training.

#### Scenario: Run has dataset bundle
- **WHEN** `runs.config_yaml.dataset_bundle` is a dataset R2 key
- **THEN** the trainer SHALL request a signed download URL through `download-dataset`
- **AND** unzip the bundle into a location compatible with the dataset YAML split paths
- **AND** scan/report dataset image counts before training begins

#### Scenario: Run has no dataset bundle
- **WHEN** no dataset bundle key exists on the run
- **THEN** the notebook SHALL continue to present the manual Drive unzip fallback

#### Scenario: Training reaches terminal status with uploaded bundle
- **WHEN** a run with `runs.config_yaml.dataset_bundle` reaches `succeeded` or
  `failed`
- **THEN** the trainer SHALL delete the temporary dataset ZIP from R2 through a
  service-role Edge Function
- **AND** the run config SHALL record the deleted bundle key and deletion time
  so operators can audit the cleanup
