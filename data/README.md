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
| 1 | apple_spot |
| 2 | banana |
| 3 | banana_spot |
| 4 | orange |
| 5 | orange_spot |

Spot classes are defect/quality regions. Label them as their own polygons when
the spot is visible. Whole-fruit/object masks and spot masks can both appear in
the same image.

Split rules:

- split by image, not by seed instance
- lock a never-seen gold-standard holdout set before training
- keep client batch/source metadata outside the train/val/test split where
  possible, so leakage can be audited
