## Design

The dashboard already uploads YAML files through `upload-dataset`; that Edge Function supports `kind: "zip"`, but the web store and training flow do not expose or consume it. This change wires the existing R2 presign path end to end.

### Run Config Contract

`runs.config_yaml` gains optional fields:

```json
{
  "dataset": "datasets/seeds-poc/<stamp>/dataset.yaml",
  "dataset_bundle": "datasets/seeds-poc/<stamp>/images.zip",
  "dataset_bundle_filename": "images.zip",
  "dataset_bundle_size_bytes": 123456
}
```

The YAML remains the source of class names and split paths. The ZIP is an image/label payload that must contain paths compatible with the YAML. The trainer supports common archive layouts:

- `images/train/...` extracted into the YAML dataset root
- `data/processed/images/train/...` extracted into the repository root
- fallback extraction into the YAML dataset root

### Colab/Trainer Flow

The notebook keeps fetching the YAML for visibility, then `scripts/train_for_run.py` repeats the authoritative setup. The script downloads the bundle through `download-dataset`, extracts it before `materialize_ultralytics_dataset_config`, and then scans split counts.

### Fallback

If no bundle is attached, the notebook still presents the manual Google Drive unzip cell.
