-- Per-report WhatsApp recipients (falls back to the client's numbers).
ALTER TABLE public.report_configs ADD COLUMN IF NOT EXISTS whatsapp_to text[] NOT NULL DEFAULT '{}';
