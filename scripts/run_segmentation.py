#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import math
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class ScaleResult:
    mm_per_pixel: float | None = None
    source: str = "none"
    marker_corners_px: Any = None
    marker_id: int | None = None


class NoneScaleProvider:
    source = "none"

    def __init__(self) -> None:
        self._last = ScaleResult(source="none")

    def update(self, frame: Any) -> ScaleResult:
        return self._last

    def last(self) -> ScaleResult:
        return self._last


class ManualScaleProvider:
    source = "manual"

    def __init__(self, mm_per_pixel: float) -> None:
        self._last = ScaleResult(mm_per_pixel=float(mm_per_pixel), source="manual")

    def update(self, frame: Any) -> ScaleResult:
        return self._last

    def last(self) -> ScaleResult:
        return self._last


class ArucoScaleProvider:
    source = "aruco"

    def __init__(self, marker_size_mm: float, dict_name: str, cv2: Any, np: Any) -> None:
        if not hasattr(cv2, "aruco"):
            raise SystemExit(
                "cv2.aruco is unavailable. Install opencv-python>=4.7 (already pinned in pyproject)."
            )
        dict_attr = getattr(cv2.aruco, dict_name, None)
        if dict_attr is None:
            raise SystemExit(
                f"Unknown ArUco dictionary: {dict_name}. Examples: DICT_4X4_50, DICT_5X5_100, DICT_APRILTAG_36h11."
            )
        self._marker_size_mm = float(marker_size_mm)
        self._dictionary = cv2.aruco.getPredefinedDictionary(dict_attr)
        self._parameters = cv2.aruco.DetectorParameters()
        self._detector = cv2.aruco.ArucoDetector(self._dictionary, self._parameters)
        self._cv2 = cv2
        self._np = np
        self._last = ScaleResult(source="aruco")

    def last(self) -> ScaleResult:
        return self._last

    def update(self, frame: Any) -> ScaleResult:
        corners, ids, _ = self._detector.detectMarkers(frame)
        if ids is None or len(corners) == 0:
            return self._last
        pts = corners[0].reshape(4, 2)
        sides = [
            float(self._np.linalg.norm(pts[(i + 1) % 4] - pts[i]))
            for i in range(4)
        ]
        mean_side_px = sum(sides) / 4.0
        if mean_side_px < 1.0:
            return self._last
        self._last = ScaleResult(
            mm_per_pixel=self._marker_size_mm / mean_side_px,
            source="aruco",
            marker_corners_px=pts,
            marker_id=int(ids.flatten()[0]),
        )
        return self._last


def measure_instance(
    polygon_xy: Any,
    mask_bool: Any | None,
    scale: ScaleResult,
    cv2: Any,
    np: Any,
) -> dict[str, Any]:
    pts = np.asarray(polygon_xy, dtype=np.float32)
    if pts.shape[0] < 3:
        return {}

    aabb_min = pts.min(axis=0)
    aabb_max = pts.max(axis=0)
    aabb_w_px = float(aabb_max[0] - aabb_min[0])
    aabb_h_px = float(aabb_max[1] - aabb_min[1])

    rect = cv2.minAreaRect(pts)
    side_a, side_b = rect[1]
    length_px = float(max(side_a, side_b))
    width_px = float(min(side_a, side_b))
    angle_deg = float(rect[2])

    if mask_bool is not None:
        area_px = float(np.count_nonzero(mask_bool))
    else:
        area_px = float(cv2.contourArea(pts))

    perimeter_px = float(cv2.arcLength(pts, closed=True))
    aspect_ratio = length_px / max(width_px, 1e-6)
    circularity = 4.0 * float(np.pi) * area_px / max(perimeter_px ** 2, 1e-6)

    out: dict[str, Any] = {
        "aabb_w_px": aabb_w_px,
        "aabb_h_px": aabb_h_px,
        "length_px": length_px,
        "width_px": width_px,
        "angle_deg": angle_deg,
        "area_px": area_px,
        "perimeter_px": perimeter_px,
        "aspect_ratio": aspect_ratio,
        "circularity": circularity,
        "scale_source": scale.source,
        "mm_per_pixel": scale.mm_per_pixel,
    }
    mpp = scale.mm_per_pixel
    if mpp is not None and mpp > 0:
        out.update({
            "aabb_w_mm": aabb_w_px * mpp,
            "aabb_h_mm": aabb_h_px * mpp,
            "length_mm": length_px * mpp,
            "width_mm": width_px * mpp,
            "perimeter_mm": perimeter_px * mpp,
            "area_mm2": area_px * (mpp ** 2),
        })
    return out


def _shape_spherical(polygon: Any, pixels_per_mm: float, cv2: Any, np: Any) -> dict[str, Any] | None:
    if len(polygon) < 3:
        return None
    pts = np.asarray(polygon, dtype=np.float32)
    area_px = float(cv2.contourArea(pts))
    if area_px <= 0:
        return None
    area_mm2 = area_px / (pixels_per_mm ** 2)
    r_mm = math.sqrt(area_mm2 / math.pi)
    vol_mm3 = (4.0 / 3.0) * math.pi * r_mm ** 3
    return {
        "shape_model": "spherical",
        "equivalent_diameter_mm": 2.0 * r_mm,
        "volume_ml": vol_mm3 / 1000.0,
    }


def _shape_oblong(polygon: Any, pixels_per_mm: float, cv2: Any, np: Any) -> dict[str, Any] | None:
    if len(polygon) < 5:
        return None
    pts = np.asarray(polygon, dtype=np.float32)

    pts_local = pts.copy()
    pts_local[:, 0] -= pts_local[:, 0].min()
    pts_local[:, 1] -= pts_local[:, 1].min()
    w = int(math.ceil(float(pts_local[:, 0].max()))) + 1
    h = int(math.ceil(float(pts_local[:, 1].max()))) + 1
    if w < 5 or h < 5:
        return None

    mask = np.zeros((h, w), dtype=np.uint8)
    cv2.fillPoly(mask, [pts_local.astype(np.int32)], 255)

    _, unit_vector = cv2.PCACompute(pts, mean=None, maxComponents=1)
    angle_deg = math.degrees(math.atan2(float(unit_vector[0, 1]), float(unit_vector[0, 0])))

    center = (w / 2.0, h / 2.0)
    m_rot = cv2.getRotationMatrix2D(center, angle_deg, 1.0)
    cos_a = abs(m_rot[0, 0])
    sin_a = abs(m_rot[0, 1])
    new_w = int(h * sin_a + w * cos_a) + 1
    new_h = int(h * cos_a + w * sin_a) + 1
    m_rot[0, 2] += (new_w / 2.0) - center[0]
    m_rot[1, 2] += (new_h / 2.0) - center[1]
    rotated = cv2.warpAffine(mask, m_rot, (new_w, new_h), flags=cv2.INTER_NEAREST)

    if rotated.shape[0] > rotated.shape[1]:
        rotated = cv2.rotate(rotated, cv2.ROTATE_90_CLOCKWISE)

    diameters_px = np.count_nonzero(rotated, axis=0)
    length_px = int(np.count_nonzero(diameters_px > 0))
    if length_px == 0:
        return None
    length_mm = length_px / pixels_per_mm

    dx_mm = 1.0 / pixels_per_mm
    radii_mm = (diameters_px.astype(np.float64) / pixels_per_mm) / 2.0
    vol_mm3 = float(np.sum(math.pi * radii_mm ** 2 * dx_mm))

    return {
        "shape_model": "oblong",
        "long_axis_mm": length_mm,
        "volume_ml": vol_mm3 / 1000.0,
    }


_SHAPE_ESTIMATORS = {
    "spherical": _shape_spherical,
    "oblong": _shape_oblong,
}


def estimate_volume(
    polygon: Any,
    class_name: str,
    scale: ScaleResult,
    volume_config: dict[str, Any] | None,
    cv2: Any,
    np: Any,
) -> dict[str, Any]:
    if not volume_config:
        return {}
    if scale.mm_per_pixel is None or scale.mm_per_pixel <= 0:
        return {}
    classes_cfg = volume_config.get("classes") or {}
    entry = classes_cfg.get(class_name)
    if entry is None:
        entry = volume_config.get("defaults")
    if not entry:
        return {}
    shape = str(entry.get("shape", "skip")).lower()
    estimator = _SHAPE_ESTIMATORS.get(shape)
    if estimator is None:
        return {}
    pixels_per_mm = 1.0 / float(scale.mm_per_pixel)
    result = estimator(polygon, pixels_per_mm, cv2, np)
    if not result:
        return {}
    finagling = float(entry.get("finagling_factor", 1.0))
    density = float(entry.get("density_g_per_ml", 1.0))
    result["volume_ml"] = float(result["volume_ml"]) * finagling
    result["weight_g"] = result["volume_ml"] * density
    result["density_g_per_ml"] = density
    result["finagling_factor"] = finagling
    return result


def load_volume_config(path: Path) -> dict[str, Any]:
    try:
        import yaml
    except ModuleNotFoundError as exc:
        raise SystemExit("PyYAML is required for --volume-config (pyproject already depends on it).") from exc
    if not path.is_file():
        raise SystemExit(f"--volume-config file not found: {path}")
    with path.open("r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh) or {}
    if not isinstance(data, dict):
        raise SystemExit(f"--volume-config must be a YAML mapping; got {type(data).__name__}: {path}")
    return data


def format_measurement_label(measurement: dict[str, Any], mode: str) -> str:
    if not measurement:
        return ""
    if "length_mm" in measurement:
        if mode == "aabb":
            w_val = measurement["aabb_w_mm"]
            h_val = measurement["aabb_h_mm"]
        else:
            w_val = measurement["width_mm"]
            h_val = measurement["length_mm"]
        area_cm2 = measurement["area_mm2"] / 100.0
        return f" {h_val:.1f}x{w_val:.1f}mm A={area_cm2:.2f}cm2"
    if mode == "aabb":
        w_val = measurement["aabb_w_px"]
        h_val = measurement["aabb_h_px"]
    else:
        w_val = measurement["width_px"]
        h_val = measurement["length_px"]
    return f" {h_val:.0f}x{w_val:.0f}px A={measurement['area_px']:.0f}px2"


def format_volume_label(measurement: dict[str, Any]) -> str:
    if "volume_ml" not in measurement:
        return ""
    vol = float(measurement["volume_ml"])
    if "weight_g" in measurement:
        return f" V={vol:.0f}mL W={float(measurement['weight_g']):.0f}g"
    return f" V={vol:.0f}mL"


class MeasurementCsvWriter:
    HEADER = [
        "frame", "instance", "class", "class_id", "confidence",
        "aabb_w_px", "aabb_h_px",
        "length_px", "width_px", "angle_deg",
        "area_px", "perimeter_px",
        "aspect_ratio", "circularity",
        "scale_source", "mm_per_pixel",
        "aabb_w_mm", "aabb_h_mm",
        "length_mm", "width_mm", "perimeter_mm", "area_mm2",
        "shape_model", "equivalent_diameter_mm", "long_axis_mm",
        "volume_ml", "weight_g", "density_g_per_ml", "finagling_factor",
    ]

    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self._file = path.open("w", newline="", encoding="utf-8")
        self._writer = csv.DictWriter(self._file, fieldnames=self.HEADER, extrasaction="ignore")
        self._writer.writeheader()
        self.path = path

    def write(self, row: dict[str, Any]) -> None:
        self._writer.writerow(row)

    def close(self) -> None:
        self._file.close()


def _pick_default_device(force_cpu: bool) -> str | None:
    if force_cpu:
        return "cpu"
    try:
        import torch
    except ModuleNotFoundError:
        return None
    if torch.cuda.is_available():
        return "0"
    if getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


class ThreadedCapture:
    def __init__(self, source: str | int, cv2: Any) -> None:
        self._cv2 = cv2
        self._cap = cv2.VideoCapture(source)
        self._lock = threading.Lock()
        self._frame: Any = None
        self._ok: bool = False
        self._stopped = False
        self._thread: threading.Thread | None = None
        if self._cap.isOpened():
            ok, frame = self._cap.read()
            self._ok = ok
            self._frame = frame
            self._thread = threading.Thread(target=self._reader, name="ThreadedCapture", daemon=True)
            self._thread.start()

    def _reader(self) -> None:
        while not self._stopped:
            ok, frame = self._cap.read()
            if not ok:
                with self._lock:
                    self._ok = False
                break
            with self._lock:
                self._ok = True
                self._frame = frame

    def isOpened(self) -> bool:
        return self._cap.isOpened()

    def get(self, prop: int) -> float:
        return self._cap.get(prop)

    def read(self) -> tuple[bool, Any]:
        with self._lock:
            return self._ok, None if self._frame is None else self._frame.copy()

    def release(self) -> None:
        self._stopped = True
        if self._thread is not None:
            self._thread.join(timeout=1.0)
        self._cap.release()


def build_scale_provider(args: argparse.Namespace, cv2: Any, np: Any) -> Any:
    if args.scale == "aruco":
        return ArucoScaleProvider(args.marker_size_mm, args.aruco_dict, cv2, np)
    if args.scale == "manual":
        if args.mm_per_pixel is None:
            raise SystemExit("--scale manual requires --mm-per-pixel <float>")
        return ManualScaleProvider(args.mm_per_pixel)
    return NoneScaleProvider()


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Run YOLO segmentation inference from a trained .pt file or training output folder, "
            "with annotated masks, labels, and optional real-world size measurement."
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
    parser.add_argument("--conf", type=threshold, default=0.4, help="Confidence Threshold. Default: 0.4.")
    parser.add_argument("--iou", type=threshold, default=0.65, help="NMS IOU Threshold. Default: 0.65.")
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

    parser.add_argument(
        "--measure",
        action="store_true",
        help="Compute per-instance size (W x H) and area. Adds an overlay on the live path and writes CSV if --measure-csv is set.",
    )
    parser.add_argument(
        "--scale",
        choices=("aruco", "manual", "none"),
        default="none",
        help="Pixel-to-mm calibration source. 'aruco' detects a printed fiducial marker each frame; "
             "'manual' uses --mm-per-pixel; 'none' reports pixel measurements only.",
    )
    parser.add_argument("--mm-per-pixel", type=float, default=None, help="Manual mm/pixel ratio (with --scale manual).")
    parser.add_argument(
        "--marker-size-mm",
        type=float,
        default=50.0,
        help="Physical side length of the ArUco marker in millimetres. Default: 50.",
    )
    parser.add_argument(
        "--aruco-dict",
        default="DICT_4X4_50",
        help="ArUco predefined dictionary name (e.g. DICT_4X4_50, DICT_5X5_100, DICT_APRILTAG_36h11). Default: DICT_4X4_50.",
    )
    parser.add_argument(
        "--measure-mode",
        choices=("rotated", "aabb"),
        default="rotated",
        help="Which bounding box drives the W x H overlay label. 'rotated' = minimum-area rotated rect (length>=width). Default: rotated.",
    )
    parser.add_argument(
        "--measure-csv",
        default=None,
        help="Write per-instance measurements to this CSV path. Relative paths land under <project>/<name>/.",
    )

    parser.add_argument(
        "--volume-config",
        default=None,
        help="Path to a YAML mapping class names to shape model + density. Enables volume (mL) and weight (g) estimation. Implies --measure.",
    )
    parser.add_argument("--half", action="store_true", help="Run inference in float16 (faster on MPS/CUDA; ignored on CPU).")
    parser.add_argument("--cpu", action="store_true", help="Force CPU inference even when MPS/CUDA is available.")
    parser.add_argument(
        "--aruco-stride",
        type=int,
        default=5,
        help="Re-detect ArUco marker every N frames; in-between frames reuse the last scale. Default: 5.",
    )
    parser.add_argument(
        "--log-every",
        type=int,
        default=30,
        help="Print per-frame status every N frames (0 disables periodic logging). Default: 30.",
    )

    args = parser.parse_args()
    if args.aruco_stride < 1:
        args.aruco_stride = 1
    if args.log_every < 0:
        args.log_every = 0

    try:
        from ultralytics import YOLO
    except ModuleNotFoundError as exc:
        raise SystemExit("ultralytics is not installed. Run: python3 -m pip install -e '.[train]'") from exc

    weights = resolve_weights(Path(args.model).expanduser())
    source: str | int = int(args.source) if args.source.isdigit() else args.source

    cv2: Any | None = None
    np: Any | None = None
    need_cv = args.live or args.measure or isinstance(source, int)
    if need_cv:
        try:
            import cv2 as _cv2
            import numpy as _np
        except ModuleNotFoundError as exc:
            raise SystemExit(
                "opencv-python and numpy are required. Run: python3 -m pip install -e '.[train]'"
            ) from exc
        cv2, np = _cv2, _np

    volume_config: dict[str, Any] | None = None
    if args.volume_config is not None:
        volume_config = load_volume_config(Path(args.volume_config).expanduser())
        if not args.measure:
            args.measure = True
            print("note: --volume-config implies --measure; enabling measurement.")

    scale_provider: Any = NoneScaleProvider()
    if args.measure:
        scale_provider = build_scale_provider(args, cv2, np)

    if args.device is None:
        args.device = _pick_default_device(force_cpu=args.cpu)
    elif args.cpu:
        args.device = "cpu"

    if args.half and args.device == "cpu":
        print("note: --half is ignored on CPU; disabling.")
        args.half = False

    model = YOLO(str(weights))

    if args.live or isinstance(source, int):
        return run_live_overlay(
            model=model,
            weights=weights,
            source=source,
            args=args,
            cv2=cv2,
            np=np,
            scale_provider=scale_provider,
            volume_config=volume_config,
        )

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
    if args.half:
        predict_kwargs["half"] = True

    print(f"weights: {weights}")
    print(f"source: {source}")
    print(f"device: {args.device} half: {args.half}")
    print(f"confidence_threshold: {args.conf}")
    print(f"nms_iou_threshold: {args.iou}")
    if args.measure:
        print(f"measure_mode: {args.measure_mode} scale_source: {scale_provider.source}")

    frame_count = 0
    last_save_dir: Path | None = None
    csv_writer: MeasurementCsvWriter | None = None

    for result in model.predict(**predict_kwargs):
        frame_count += 1
        last_save_dir = Path(result.save_dir) if getattr(result, "save_dir", None) else last_save_dir
        boxes = getattr(result, "boxes", None)
        masks = getattr(result, "masks", None)
        detection_count = len(boxes) if boxes is not None else 0
        mask_count = len(masks) if masks is not None else 0
        print(f"frame={frame_count} detections={detection_count} masks={mask_count}")

        if not args.measure or masks is None or boxes is None:
            continue

        if csv_writer is None and args.measure_csv is not None:
            csv_writer = _open_measurement_csv(args.measure_csv, last_save_dir, project, args.name)

        frame_img = getattr(result, "orig_img", None)
        scale = scale_provider.update(frame_img) if frame_img is not None else ScaleResult(source=scale_provider.source)
        polygons = list(getattr(masks, "xy", []) or [])
        masks_data = getattr(masks, "data", None)
        class_ids = boxes.cls.cpu().numpy().astype(int).tolist() if boxes.cls is not None else []
        confidences = boxes.conf.cpu().numpy().tolist() if boxes.conf is not None else []
        names = getattr(model, "names", {}) or {}

        for index, polygon in enumerate(polygons):
            mask_bool = None
            if masks_data is not None and index < len(masks_data):
                raw = masks_data[index]
                mask_bool = raw.cpu().numpy().astype(bool) if hasattr(raw, "cpu") else np.asarray(raw).astype(bool)
            measurement = measure_instance(polygon, mask_bool, scale, cv2, np)
            if not measurement:
                continue
            cid = class_ids[index] if index < len(class_ids) else -1
            conf = confidences[index] if index < len(confidences) else 0.0
            cname = class_name(names, cid)
            if volume_config is not None:
                measurement.update(estimate_volume(polygon, cname, scale, volume_config, cv2, np))
            print(
                f"  inst={index} class={cname} conf={conf:.3f}"
                + format_measurement_label(measurement, args.measure_mode)
                + format_volume_label(measurement)
            )
            if csv_writer is not None:
                row = {
                    "frame": frame_count,
                    "instance": index,
                    "class": cname,
                    "class_id": cid,
                    "confidence": conf,
                    **measurement,
                }
                csv_writer.write(row)

    if csv_writer is not None:
        csv_writer.close()
        print(f"measurement_csv: {csv_writer.path}")
    if last_save_dir and not args.no_save:
        print(f"annotated_output: {last_save_dir}")
    return 0


def run_live_overlay(
    model: Any,
    weights: Path,
    source: str | int,
    args: argparse.Namespace,
    cv2: Any,
    np: Any,
    scale_provider: Any,
    volume_config: dict[str, Any] | None = None,
) -> int:
    capture = ThreadedCapture(source, cv2)
    if not capture.isOpened():
        raise SystemExit(f"Unable to open live source: {source}")

    writer: Any | None = None
    output_path: Path | None = None
    output_dir: Path | None = None
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

    csv_writer: MeasurementCsvWriter | None = None
    if args.measure and args.measure_csv is not None:
        csv_writer = _open_measurement_csv(args.measure_csv, output_dir, Path(args.project), args.name)

    print(f"weights: {weights}")
    print(f"source: {source}")
    print(f"device: {args.device} half: {args.half}")
    print(f"confidence_threshold: {args.conf}")
    print(f"nms_iou_threshold: {args.iou}")
    if args.measure:
        print(f"measure_mode: {args.measure_mode} scale_source: {scale_provider.source} aruco_stride: {args.aruco_stride}")
    print("live_controls: press q or esc to stop")

    base_predict_kwargs: dict[str, Any] = {
        "conf": args.conf,
        "iou": args.iou,
        "imgsz": args.imgsz,
        "agnostic_nms": args.agnostic_nms,
        "max_det": args.max_det,
        "retina_masks": args.retina_masks,
        "verbose": False,
    }
    if args.device:
        base_predict_kwargs["device"] = args.device
    if args.half:
        base_predict_kwargs["half"] = True

    previous_time = time.perf_counter()
    smoothed_fps = 0.0
    frame_count = 0

    while True:
        ok, frame = capture.read()
        if not ok or frame is None:
            time.sleep(0.001)
            continue

        frame_count += 1
        result = model.predict(source=frame, **base_predict_kwargs)[0]
        now = time.perf_counter()
        instant_fps = 1.0 / max(now - previous_time, 1e-6)
        smoothed_fps = instant_fps if smoothed_fps == 0 else (0.85 * smoothed_fps + 0.15 * instant_fps)
        previous_time = now

        if args.measure:
            if frame_count == 1 or frame_count % args.aruco_stride == 0:
                scale = scale_provider.update(frame)
            else:
                scale = scale_provider.last()
        else:
            scale = ScaleResult(source="none")

        annotated, object_count, measurements = draw_segmentation_overlay(
            frame=frame,
            result=result,
            names=getattr(model, "names", {}) or {},
            fps=smoothed_fps,
            scale=scale,
            measure_mode=args.measure_mode if args.measure else None,
            volume_config=volume_config,
            np=np,
            cv2=cv2,
        )

        if args.log_every > 0 and (frame_count == 1 or frame_count % args.log_every == 0):
            msg = f"frame={frame_count} fps={smoothed_fps:.1f} objects={object_count}"
            if args.measure and scale.mm_per_pixel is not None:
                msg += f" scale={scale.mm_per_pixel:.4f}mm/px"
            print(msg)

        if csv_writer is not None:
            class_ids, confidences = _extract_class_conf(result)
            names_map = getattr(model, "names", {}) or {}
            for index, measurement in enumerate(measurements):
                if not measurement:
                    continue
                cid = class_ids[index] if index < len(class_ids) else -1
                conf = confidences[index] if index < len(confidences) else 0.0
                csv_writer.write({
                    "frame": frame_count,
                    "instance": index,
                    "class": class_name(names_map, cid),
                    "class_id": cid,
                    "confidence": conf,
                    **measurement,
                })

        if writer is not None:
            writer.write(annotated)

        cv2.imshow(args.window_name, annotated)
        key = cv2.waitKey(1) & 0xFF
        if key in (27, ord("q")):
            break

    capture.release()
    if writer is not None:
        writer.release()
    if csv_writer is not None:
        csv_writer.close()
        print(f"measurement_csv: {csv_writer.path}")
    cv2.destroyAllWindows()
    if output_path is not None:
        print(f"annotated_output: {output_path}")
    return 0


def draw_segmentation_overlay(
    frame: Any,
    result: Any,
    names: dict[int, str] | dict[str, str],
    fps: float,
    scale: ScaleResult,
    measure_mode: str | None,
    volume_config: dict[str, Any] | None,
    np: Any,
    cv2: Any,
) -> tuple[Any, int, list[dict[str, Any]]]:
    annotated = frame.copy()
    overlay = frame.copy()
    masks = getattr(result, "masks", None)

    polygons = list(getattr(masks, "xy", []) or [])
    object_count = len(polygons)
    class_ids, confidences = _extract_class_conf(result)

    masks_data = getattr(masks, "data", None) if masks is not None else None
    measurements: list[dict[str, Any]] = []
    if measure_mode is not None:
        for index, polygon in enumerate(polygons):
            mask_bool = None
            if masks_data is not None and index < len(masks_data):
                raw = masks_data[index]
                mask_bool = raw.cpu().numpy().astype(bool) if hasattr(raw, "cpu") else np.asarray(raw).astype(bool)
            measurement = measure_instance(polygon, mask_bool, scale, cv2, np)
            if volume_config is not None and measurement:
                cid = class_ids[index] if index < len(class_ids) else -1
                measurement.update(
                    estimate_volume(polygon, class_name(names, cid), scale, volume_config, cv2, np)
                )
            measurements.append(measurement)
    else:
        measurements = [{} for _ in polygons]

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
        label = f"{class_name(names, class_id)} {confidence * 100:.1f}%"
        if measure_mode is not None:
            label += format_measurement_label(measurements[index], measure_mode)
            label += format_volume_label(measurements[index])
        draw_instance_label(image=annotated, polygon=points, label=label, color=color, cv2=cv2)

    if measure_mode is not None:
        draw_marker_overlay(annotated, scale, cv2, np)
    draw_hud(annotated, fps=fps, object_count=object_count, scale=scale, cv2=cv2)
    return annotated, object_count, measurements


def _extract_class_conf(result: Any) -> tuple[list[int], list[float]]:
    boxes = getattr(result, "boxes", None)
    if boxes is None:
        return [], []
    class_ids = boxes.cls.cpu().numpy().astype(int).tolist() if boxes.cls is not None else []
    confidences = boxes.conf.cpu().numpy().tolist() if boxes.conf is not None else []
    return class_ids, confidences


def _open_measurement_csv(
    csv_arg: str,
    save_dir: Path | None,
    project: Path,
    name: str,
) -> MeasurementCsvWriter:
    requested = Path(csv_arg).expanduser()
    if requested.is_absolute():
        target = requested
    else:
        base = save_dir if save_dir is not None else (Path(project).expanduser().resolve() / name)
        target = base / requested
    return MeasurementCsvWriter(target)


def draw_instance_label(image: Any, polygon: Any, label: str, color: tuple[int, int, int], cv2: Any) -> None:
    x = int(polygon[:, 0, 0].min())
    y = int(polygon[:, 0, 1].min())
    y = max(18, y - 6)
    x = max(8, x)
    cv2.putText(image, label, (x + 1, y + 1), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (0, 0, 0), 2, cv2.LINE_AA)
    cv2.putText(image, label, (x, y), cv2.FONT_HERSHEY_SIMPLEX, 0.48, color, 1, cv2.LINE_AA)


def draw_marker_overlay(image: Any, scale: ScaleResult, cv2: Any, np: Any) -> None:
    if scale.source != "aruco" or scale.marker_corners_px is None:
        return
    pts = np.asarray(scale.marker_corners_px, dtype=np.int32).reshape(-1, 1, 2)
    cv2.polylines(image, [pts], isClosed=True, color=(0, 255, 255), thickness=2, lineType=cv2.LINE_AA)
    if scale.mm_per_pixel is None:
        return
    x = int(pts[:, 0, 0].min())
    y = int(pts[:, 0, 1].min())
    label = f"marker#{scale.marker_id} {scale.mm_per_pixel:.3f}mm/px"
    cv2.putText(image, label, (x + 1, max(14, y - 7)), cv2.FONT_HERSHEY_SIMPLEX, 0.46, (0, 0, 0), 2, cv2.LINE_AA)
    cv2.putText(image, label, (x, max(13, y - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.46, (0, 255, 255), 1, cv2.LINE_AA)


def draw_hud(image: Any, fps: float, object_count: int, scale: ScaleResult, cv2: Any) -> None:
    lines = [f"FPS {fps:.1f}", f"Objects {object_count}"]
    if scale.source != "none":
        if scale.mm_per_pixel is not None:
            lines.append(f"Scale {scale.mm_per_pixel:.4f} mm/px ({scale.source})")
        else:
            lines.append(f"Scale waiting on {scale.source}")
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


_CLASS_COLOR_CACHE: dict[int, tuple[int, int, int]] = {}


def class_color(class_id: int, np: Any) -> tuple[int, int, int]:
    cached = _CLASS_COLOR_CACHE.get(class_id)
    if cached is not None:
        return cached
    rng = np.random.default_rng(max(class_id, 0) + 42)
    color = rng.integers(80, 256, size=3).tolist()
    rgb = (int(color[0]), int(color[1]), int(color[2]))
    _CLASS_COLOR_CACHE[class_id] = rgb
    return rgb


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
