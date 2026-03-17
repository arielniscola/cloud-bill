-- Add activityStartDate to afip_config (fecha de inicio de actividades)
ALTER TABLE "afip_config" ADD COLUMN IF NOT EXISTS "activityStartDate" TIMESTAMP(3);
