-- Stage 2: scheduler bookkeeping and delivery origin.
ALTER TABLE public.report_schedules ADD COLUMN IF NOT EXISTS last_run_at timestamptz;

ALTER TABLE public.report_deliveries ADD COLUMN IF NOT EXISTS schedule_id uuid REFERENCES public.report_schedules(id) ON DELETE SET NULL;
ALTER TABLE public.report_deliveries ADD COLUMN IF NOT EXISTS trigger text NOT NULL DEFAULT 'manual';
ALTER TABLE public.report_deliveries DROP CONSTRAINT IF EXISTS report_deliveries_trigger_check;
ALTER TABLE public.report_deliveries ADD CONSTRAINT report_deliveries_trigger_check CHECK (trigger IN ('schedule','manual'));

-- Share tokens are looked up on every public panel/PDF request.
CREATE INDEX IF NOT EXISTS report_configs_share_token_idx ON public.report_configs(share_token) WHERE share_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS report_deliveries_sent_at_idx ON public.report_deliveries(sent_at DESC);
