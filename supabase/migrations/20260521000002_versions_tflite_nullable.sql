-- Make versions.tflite_r2_key nullable so runs that disable the Android
-- export can still create a version row with only iOS / PyTorch artifacts.
alter table public.versions
  alter column tflite_r2_key drop not null;
