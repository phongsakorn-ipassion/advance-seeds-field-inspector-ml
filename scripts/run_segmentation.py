#!/usr/bin/env python3
from __future__ import annotations

import argparse
import time
from pathlib import Path
from typing import Any


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Run YOLO segmentation inference from a trained .pt file or training output folder, "
            "with annotated masks and labels."
        )
    )
    parser.add_argument(
        "--model",
        "--weights",
        required=True,
        dest="model",
        help="Path to a .pt weights file, a weights/ folder, or a training run folder containing weights/best.pt.",
    )
    parser.add_argument(
        "--source",
        required=True,
        help="Image, video, folder, URL, or camera index. Use --source 0 for the default webcam.",
    )
    parser.add_argument(
        "--conf",
        type=threshold,
        default=0.4,
        help="Confidence Threshold. Default: 0.4.",
    )
    parser.add_argument(
        "--iou",
        type=threshold,
        default=0.65,
        help="NMS IOU Threshold. Default: 0.65.",
    )
    parser.add_argument("--imgsz", type=int, default=640, help="Inference image size. Default: 640.")
    parser.add_argument("--device", default=None, help="Inference device, for example cpu, mps, 0, or 0,1.")
    parser.add_argument("--project", default="runs/segment-predict", help="Output project directory.")
    parser.add_argument("--name", default="predict", help="Output run name under --project.")
    parser.add_argument("--no-save", action="store_true", help="Do not save annotated images/videos.")
    parser.add_argument("--show", action="store_true", help="Show live annotated output while running.")
    parser.add_argument(
        "--live",
        action="store_true",
        help="Use a custom live OpenCV view with mask contours, labels, confidence, FPS, and object count. No boxes.",
    )
    parser.add_argument("--save-txt", action="store_true", help="Save YOLO prediction labels.")
    parser.add_argument("--save-conf", action="store_true", help="Include confidence values in saved labels.")
    parser.add_argument("--retina-masks", action="store_true", help="Render higher-resolution segmentation masks.")
    parser.add_argument("--agnostic-nms", action="store_true", help="Run class-agnostic NMS.")
    parser.add_argument("--max-det", type=int, default=300, help="Maximum detections per image/frame.")
    parser.add_argument("--window-name", default="Advance Seeds Live Segmentation", help="Live preview window name.")
    args = parser.parse_args()

    try:
        from ultralytics import YOLO
    except ModuleNotFoundError as exc:
        raise SystemExit("ultralytics is not installed. Run: python3 -m pip install -e '.[train]'") from exc

    weights = resolve_weights(Path(args.model).expanduser())
    source: str | int = int(args.source) if args.source.isdigit() else args.source

    model = YOLO(str(weights))

    if args.live or isinstance(source, int):
        return run_live_overlay(model=model, weights=weights, source=source, args=args)

    project = Path(args.project).expanduser().resolve()
    predict_kwargs: dict[str, Any] = {
        "source": source,
        "conf": args.conf,
        "iou": args.iou,
        "imgsz": args.imgsz,
        "save": not args.no_save,
        "show": args.show,
        "save_txt": args.save_txt,
        "save_conf": args.save_conf,
        "retina_masks": args.retina_masks,
        "agnostic_nms": args.agnostic_nms,
        "max_det": args.max_det,
        "project": str(project),
        "name": args.name,
        "exist_ok": True,
        "stream": True,
        "verbose": True,
    }
    if args.device:
        predict_kwargs["device"] = args.device

    print(f"weights: {weights}")
    print(f"source: {source}")
    print(f"confidence_threshold: {args.conf}")
    print(f"nms_iou_threshold: {args.iou}")

    frame_count = 0
    last_save_dir: Path | None = None
    for result in model.predict(**predict_kwargs):
        frame_count += 1
        last_save_dir = Path(result.save_dir) if getattr(result, "save_dir", None) else last_save_dir
        boxes = getattr(result, "boxes", None)
        masks = getattr(result, "masks", None)
        detection_count = len(boxes) if boxes is not None else 0
        mask_count = len(masks) if masks is not None else 0
        print(f"frame={frame_count} detections={detection_count} masks={mask_count}")

    if last_save_dir and not args.no_save:
        print(f"annotated_output: {last_save_dir}")
    return 0


def run_live_overlay(model: Any, weights: Path, source: str | int, args: argparse.Namespace) -> int:
    try:
        import cv2
        import numpy as np
    except ModuleNotFoundError as exc:
        raise SystemExit("opencv-python and numpy are required. Run: python3 -m pip install -e '.[train]'") from exc

    capture = cv2.VideoCapture(source)
    if not capture.isOpened():
        raise SystemExit(f"Unable to open live source: {source}")

    writer: Any | None = None
    output_path: Path | None = None
    if not args.no_save:
        output_dir = Path(args.project).expanduser().resolve() / args.name
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / "live_annotated.mp4"
        fps = capture.get(cv2.CAP_PROP_FPS)
        fps = fps if fps and fps > 0 else 30.0
        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(str(output_path), fourcc, fps, (width, height))

    print(f"weights: {weights}")
    print(f"source: {source}")
    print(f"confidence_threshold: {args.conf}")
    print(f"nms_iou_threshold: {args.iou}")
    print("live_controls: press q or esc to stop")

    previous_time = time.perf_counter()
    smoothed_fps = 0.0
    frame_count = 0

    while True:
        ok, frame = capture.read()
        if not ok:
            break

        frame_count += 1
        predict_kwargs: dict[str, Any] = {
            "source": frame,
            "conf": args.conf,
            "iou": args.iou,
            "imgsz": args.imgsz,
            "agnostic_nms": args.agnostic_nms,
            "max_det": args.max_det,
            "retina_masks": args.retina_masks,
            "verbose": False,
        }
        if args.device:
            predict_kwargs["device"] = args.device

        result = model.predict(**predict_kwargs)[0]
        now = time.perf_counter()
        instant_fps = 1.0 / max(now - previous_time, 1e-6)
        smoothed_fps = instant_fps if smoothed_fps == 0 else (0.85 * smoothed_fps + 0.15 * instant_fps)
        previous_time = now

        annotated, object_count = draw_segmentation_overlay(
            frame=frame,
            result=result,
            names=getattr(model, "names", {}) or {},
            fps=smoothed_fps,
            np=np,
            cv2=cv2,
        )
        print(f"frame={frame_count} fps={smoothed_fps:.1f} objects={object_count}")

        if writer is not None:
            writer.write(annotated)

        cv2.imshow(args.window_name, annotated)
        key = cv2.waitKey(1) & 0xFF
        if key in (27, ord("q")):
            break

    capture.release()
    if writer is not None:
        writer.release()
    cv2.destroyAllWindows()
    if output_path is not None:
        print(f"annotated_output: {output_path}")
    return 0


def draw_segmentation_overlay(
    frame: Any,
    result: Any,
    names: dict[int, str] | dict[str, str],
    fps: float,
    np: Any,
    cv2: Any,
) -> tuple[Any, int]:
    annotated = frame.copy()
    overlay = frame.copy()
    boxes = getattr(result, "boxes", None)
    masks = getattr(result, "masks", None)

    polygons = list(getattr(masks, "xy", []) or [])
    object_count = len(polygons)
    class_ids = boxes.cls.cpu().numpy().astype(int).tolist() if boxes is not None and boxes.cls is not None else []
    confidences = boxes.conf.cpu().numpy().tolist() if boxes is not None and boxes.conf is not None else []

    for index, polygon in enumerate(polygons):
        if len(polygon) < 3:
            continue
        points = np.asarray(polygon, dtype=np.int32).reshape((-1, 1, 2))
        color = class_color(class_ids[index] if index < len(class_ids) else -1, np)
        cv2.fillPoly(overlay, [points], color)

    annotated = cv2.addWeighted(overlay, 0.32, annotated, 0.68, 0)

    for index, polygon in enumerate(polygons):
        if len(polygon) < 3:
            continue
        points = np.asarray(polygon, dtype=np.int32).reshape((-1, 1, 2))
        class_id = class_ids[index] if index < len(class_ids) else -1
        confidence = confidences[index] if index < len(confidences) else 0.0
        color = class_color(class_id, np)

        cv2.polylines(annotated, [points], isClosed=True, color=color, thickness=2, lineType=cv2.LINE_AA)
        draw_instance_label(
            image=annotated,
            polygon=points,
            label=f"{class_name(names, class_id)} {confidence * 100:.1f}%",
            color=color,
            cv2=cv2,
        )

    draw_hud(annotated, fps=fps, object_count=object_count, cv2=cv2)
    return annotated, object_count


def draw_instance_label(image: Any, polygon: Any, label: str, color: tuple[int, int, int], cv2: Any) -> None:
    x = int(polygon[:, 0, 0].min())
    y = int(polygon[:, 0, 1].min())
    y = max(18, y - 6)
    x = max(8, x)
    cv2.putText(image, label, (x + 1, y + 1), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (0, 0, 0), 2, cv2.LINE_AA)
    cv2.putText(image, label, (x, y), cv2.FONT_HERSHEY_SIMPLEX, 0.48, color, 1, cv2.LINE_AA)


def draw_hud(image: Any, fps: float, object_count: int, cv2: Any) -> None:
    lines = [f"FPS {fps:.1f}", f"Objects {object_count}"]
    x, y = 12, 26
    for offset, text in enumerate(lines):
        baseline = y + offset * 28
        cv2.putText(image, text, (x + 1, baseline + 1), cv2.FONT_HERSHEY_SIMPLEX, 0.72, (0, 0, 0), 4, cv2.LINE_AA)
        cv2.putText(image, text, (x, baseline), cv2.FONT_HERSHEY_SIMPLEX, 0.72, (255, 255, 255), 2, cv2.LINE_AA)


def class_name(names: dict[int, str] | dict[str, str], class_id: int) -> str:
    if class_id in names:
        return str(names[class_id])
    text_id = str(class_id)
    if text_id in names:
        return str(names[text_id])
    return f"class_{class_id}"


def class_color(class_id: int, np: Any) -> tuple[int, int, int]:
    rng = np.random.default_rng(max(class_id, 0) + 42)
    color = rng.integers(80, 256, size=3).tolist()
    return int(color[0]), int(color[1]), int(color[2])


def threshold(value: str) -> float:
    try:
        parsed = float(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"expected a number between 0 and 1, got {value!r}") from exc
    if not 0.0 <= parsed <= 1.0:
        raise argparse.ArgumentTypeError(f"expected a number between 0 and 1, got {value!r}")
    return parsed


def resolve_weights(path: Path) -> Path:
    path = path.resolve()
    if path.is_file():
        if path.suffix != ".pt":
            raise SystemExit(f"Model file must be a .pt file: {path}")
        return path
    if not path.is_dir():
        raise SystemExit(f"Model path does not exist: {path}")

    candidates = [
        path / "best.pt",
        path / "last.pt",
        path / "weights" / "best.pt",
        path / "weights" / "last.pt",
    ]
    candidates.extend(sorted(path.glob("**/best.pt")))
    candidates.extend(sorted(path.glob("**/last.pt")))
    candidates.extend(sorted(path.glob("**/*.pt")))

    seen: set[Path] = set()
    for candidate in candidates:
        candidate = candidate.resolve()
        if candidate in seen:
            continue
        seen.add(candidate)
        if candidate.is_file() and candidate.suffix == ".pt":
            return candidate
    raise SystemExit(f"No .pt weights found under: {path}")


if __name__ == "__main__":
    raise SystemExit(main())
