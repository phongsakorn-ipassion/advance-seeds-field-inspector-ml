from __future__ import annotations

from pathlib import Path

CANONICAL_CLASS_NAMES = {
    0: "apple",
    1: "apple_spot",
    2: "banana",
    3: "banana_spot",
    4: "orange",
    5: "orange_spot",
}

BANANA_V1_CLASS_REMAP = {
    0: 2,
    1: 3,
}


def remap_label_line(line: str, class_remap: dict[int, int] | None = None) -> str:
    stripped = line.strip()
    if not stripped:
        return ""
    remap = class_remap or BANANA_V1_CLASS_REMAP
    parts = stripped.split()
    try:
        source_class = int(parts[0])
    except ValueError as exc:
        raise ValueError(f"class id must be an integer: {parts[0]!r}") from exc
    if source_class not in remap:
        raise ValueError(f"class id {source_class} is not mapped")
    parts[0] = str(remap[source_class])
    remapped = " ".join(parts)
    issue = validate_segmentation_row(remapped)
    if issue:
        raise ValueError(issue)
    return remapped


def remap_label_text(
    text: str,
    class_remap: dict[int, int] | None = None,
    *,
    skip_invalid: bool = False,
) -> str:
    lines: list[str] = []
    for line in text.splitlines():
        try:
            lines.append(remap_label_line(line, class_remap))
        except ValueError:
            if not skip_invalid:
                raise
    non_empty = [line for line in lines if line]
    return "\n".join(non_empty) + ("\n" if non_empty else "")


def count_valid_remapped_rows(text: str, class_remap: dict[int, int] | None = None) -> tuple[int, int]:
    valid = 0
    skipped = 0
    for line in text.splitlines():
        if not line.strip():
            continue
        try:
            remap_label_line(line, class_remap)
            valid += 1
        except ValueError:
            skipped += 1
    return valid, skipped


def validate_segmentation_row(line: str) -> str | None:
    parts = line.split()
    if len(parts) < 7:
        return "segmentation row needs class id plus at least 3 polygon points"
    if (len(parts) - 1) % 2 != 0:
        return "polygon coordinate count must be even"
    for value in parts[1:]:
        try:
            coord = float(value)
        except ValueError:
            return f"coordinate {value!r} is not numeric"
        if coord < 0 or coord > 1:
            return f"coordinate {coord} is outside normalized range [0, 1]"
    return None


def write_dataset_yaml(path: Path, dataset_root: str = "../data/processed/advance-seeds-banana-v1") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    names = "\n".join(f"  {idx}: {name}" for idx, name in CANONICAL_CLASS_NAMES.items())
    path.write_text(
        "\n".join(
            [
                f"path: {dataset_root}",
                "train: images/train",
                "val: images/val",
                "test: images/test",
                "",
                "names:",
                names,
                "",
            ]
        ),
        encoding="utf-8",
    )
