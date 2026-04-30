# Data

Keep raw client data out of Git. Use this folder only for local datasets.

Recommended layout:

```text
data/
  raw/                         Original exported labels and source images
  processed/advance-seeds-v1/
    images/
      train/
      val/
      test/
    labels/
      train/
      val/
      test/
```

Labels should use YOLO segmentation format:

```text
class_id x1 y1 x2 y2 x3 y3 ...
```

Coordinates are normalized to `[0, 1]`. Each polygon needs at least three
points, so each label row must contain one class id plus at least six numeric
coordinate values.

PoC class ids:

| id | class |
| --- | --- |
| 0 | apple |
| 1 | banana |
| 2 | broccoli |
| 3 | carrot |
| 4 | orange |

Split rules:

- split by image, not by seed instance
- lock a never-seen gold-standard holdout set before training
- keep client batch/source metadata outside the train/val/test split where
  possible, so leakage can be audited
