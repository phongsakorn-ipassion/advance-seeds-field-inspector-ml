# AGENTS.md

@/Users/pitikorn/.codex/RTK.md

ไฟล์นี้เป็นคำสั่งสำหรับ Codex ใน repo
`advance-seeds-field-inspector-ml` อ่านร่วมกับ `CLAUDE.md` เมื่อต้องการ handoff
รายละเอียดของ training, registry หรือ deployment

## ภาพรวม repo

repo นี้เป็นฝั่ง ML และ model delivery ของ Advance Seeds Field Inspector มีหน้าที่
เตรียม dataset, train/evaluate segmentation model, ตรวจ calibration/export สำหรับ
mobile, ดูแล model registry และส่ง artifact ให้แอป demo

ขอบเขตหลัก:

- `src/advance_seeds_ml/` คือ Python package สำหรับ dataset, calibration,
  contract และ training helpers
- `scripts/` คือ operator entrypoints สำหรับ validation, training, export,
  metadata และ handoff เข้า demo repo
- `configs/model_export_contract.json` คือ contract ระหว่าง ML กับ mobile app
- `supabase/` คือ registry schema, RLS, Edge Functions และ tests ของ registry
- `apps/web/` คือ Vite + React registry dashboard
- `packages/training-worker/` คือ hosted worker บน Modal
- `openspec/` คือ spec และ change workflow ของ repo นี้

งานเกี่ยวกับ mobile screens, capture UX, Expo native modules ฝั่งแอป, i18n หรือ
design tokens ให้ route ไป `../advance-seeds-field-inspector-demo/`

## Contract กับ demo app

- app consumer อยู่ใน demo repo ผ่าน runtime seam `SeedAnalyzer`
- contract หลักอยู่ที่ `configs/model_export_contract.json`; อย่าเปลี่ยน
  `input_size`, output shape, threshold semantics, artifact filenames หรือ supported
  calibration sources แบบฝั่งเดียว
- mobile TFLite filename `yolo11n-seeds.tflite` เป็น frozen alias แม้ source
  weights จริงเป็น YOLO26n-seg; บันทึก source model จริงใน
  `model-metadata.json`
- handoff artifact เข้าแอปผ่าน `scripts/export_to_demo.py` ไปที่
  `../advance-seeds-field-inspector-demo/apps/mobile/assets/models/`
- ถ้า change กระทบ contract, class list, metadata ที่แอปใช้ หรือ artifact loading
  flow ให้มี OpenSpec ฝั่ง ML และประสาน change ฝั่ง demo ด้วย

## จุดที่ต้องรู้ก่อนแก้โค้ด

- Python tests ใช้ stdlib `unittest` ไม่ใช่ `pytest`
- scaffold dependencies เบาพอสำหรับ dataset/contract tests; extra `[train]`
  หนักเพราะดึง Ultralytics, OpenCV, NumPy, PyTorch และ export dependencies
  เพิ่มตามงานเท่านั้น
- real training อาจต้อง GPU/CUDA หรือ Apple Silicon MPS; อย่ารัน training หนัก
  เพียงเพื่อ verify change ที่เป็น docs, contract helper หรือ dashboard UI
- model registry ใช้ Supabase + Cloudflare R2; Edge Functions อยู่ใน
  `supabase/functions/`
- dashboard กับ Edge Functions ใช้ shared registry schema; migration/RLS change
  ต้องตรวจ surface ที่เกี่ยวข้อง ไม่ใช่ดูเฉพาะ Python package
- Modal worker อยู่ใน `packages/training-worker/`; hosted run และ callback ต้อง
  รักษา registry state และ artifact metadata ให้ตรงกัน

## โครงงานที่เจอบ่อย

- dataset validation: `src/advance_seeds_ml/dataset.py`,
  `scripts/validate_dataset.py`
- banana PoC prep: `src/advance_seeds_ml/banana_dataset.py`,
  `scripts/prepare_banana_dataset.py`
- calibration helpers: `src/advance_seeds_ml/calibration.py`
- metadata/contract helpers: `src/advance_seeds_ml/contracts.py`,
  `scripts/write_model_metadata.py`
- training drivers: `src/advance_seeds_ml/training.py`,
  `scripts/train_yolo26n_seg.py`, `scripts/train_for_run.py`
- mobile export: `scripts/export_mobile_model_candidates.py`,
  `scripts/export_to_demo.py`
- registry SDK: `src/advance_seeds_ml/registry/`

## คำสั่งหลัก

Python scaffold และ tests:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -U pip
python -m pip install -e .
python -m unittest discover -s tests
python scripts/validate_dataset.py configs/dataset.example.yaml
```

ติดตั้ง training dependencies เฉพาะเมื่องานต้อง train/export จริง:

```bash
python -m pip install -e '.[train]'
```

registry Supabase local:

```bash
cd supabase
cp .env.example .env.local
supabase start
supabase db reset
supabase functions serve start-training --env-file .env.local
```

registry dashboard:

```bash
cd apps/web
pnpm install
pnpm test
pnpm build
pnpm dev
```

OpenSpec validation หลัก:

```bash
openspec list
openspec list --specs
openspec validate --all --strict
python3 -m unittest discover -s tests
```

## OpenSpec และการตรวจงาน

- งาน non-trivial ต้องผูกกับ `openspec/changes/` ของ repo นี้
- ก่อนเสนอ change ให้ดู canonical specs ที่เกี่ยวข้อง เช่น
  `dataset-preparation`, `segmentation-training`, `mobile-model-export`,
  `model-registry`, `hosted-training-trigger`, `training-worker`
- เลือก verification ตาม surface:
  - Python package/scripts: `python3 -m unittest discover -s tests`
  - contract/export change: ตรวจ `configs/model_export_contract.json`,
    metadata generation และระบุผลกระทบต่อ demo repo
  - web dashboard: รัน command ใน `apps/web/`
  - Supabase registry/RLS/Edge Functions: ตรวจ migration, function และ local
    workflow ที่เกี่ยวข้อง

## Secrets และ artifacts

- ห้าม commit R2 key, Modal token, Supabase service-role key หรือ env จริง
- ห้าม commit dataset image ที่ไม่มีสิทธิ์ redistribute
- อย่า commit raw model weight หรือ trained artifact ขนาดใหญ่เข้า git; artifact
  ปกติไหลผ่าน R2 และ model registry
- R2 CORS และ cloud secrets เป็น infrastructure concern; ถ้างานต้องแก้ให้บอก
  ขั้นตอน verify ที่ทำได้จริงและส่วนที่ต้องใช้ credential ภายนอก

## ระวัง

- อย่า rename `yolo11n-seeds.tflite` เพราะเห็นว่าไม่ตรง YOLO26n-seg
- อย่าตัดสิน model release จาก pixel metric อย่างเดียว ถ้า acceptance gate ต้อง
  measurement error ใน millimeter
- อย่าทำ schema/function change ที่กระทบ demo app โดยไม่ชี้ผลกระทบต่อ generated
  types และ app consumer
- อย่าลบ dataset, model export หรือ work-in-progress artifact ในเครื่องผู้ใช้ถ้า
  โจทย์ไม่ได้สั่งชัด
