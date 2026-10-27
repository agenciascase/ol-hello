-- Campaign scope per report: all campaigns, only active ones, or a hand-picked list.
-- campaign_ids holds "google:<id>" / "meta:<id>" entries.
ALTER TABLE public.report_configs
  ADD COLUMN IF NOT EXISTS campaign_mode text NOT NULL DEFAULT 'all' CHECK (campaign_mode IN ('all','active','selected')),
  ADD COLUMN IF NOT EXISTS campaign_ids text[] NOT NULL DEFAULT '{}';
