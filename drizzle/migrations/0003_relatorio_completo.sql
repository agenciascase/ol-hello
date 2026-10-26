-- Full report: client goals, budget and taxes; report objective, sections and manager analysis; report cache.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS monthly_budget numeric CHECK (monthly_budget IS NULL OR monthly_budget >= 0),
  ADD COLUMN IF NOT EXISTS goal_cpa numeric CHECK (goal_cpa IS NULL OR goal_cpa > 0),
  ADD COLUMN IF NOT EXISTS goal_conversions_month numeric CHECK (goal_conversions_month IS NULL OR goal_conversions_month > 0),
  ADD COLUMN IF NOT EXISTS goal_roas numeric CHECK (goal_roas IS NULL OR goal_roas > 0),
  ADD COLUMN IF NOT EXISTS meta_tax_pct numeric NOT NULL DEFAULT 0 CHECK (meta_tax_pct >= 0 AND meta_tax_pct <= 100),
  ADD COLUMN IF NOT EXISTS google_tax_pct numeric NOT NULL DEFAULT 0 CHECK (google_tax_pct >= 0 AND google_tax_pct <= 100);

ALTER TABLE public.report_configs
  ADD COLUMN IF NOT EXISTS objective text NOT NULL DEFAULT 'leads',
  ADD COLUMN IF NOT EXISTS sections text[] NOT NULL DEFAULT '{highlights,goals,analysis,daily,funnel,conversions,platforms,campaigns,creatives,search_terms,audience,history,glossary}',
  ADD COLUMN IF NOT EXISTS manager_notes text,
  ADD COLUMN IF NOT EXISTS actions_taken text,
  ADD COLUMN IF NOT EXISTS next_steps text;
ALTER TABLE public.report_configs DROP CONSTRAINT IF EXISTS report_configs_objective_check;
ALTER TABLE public.report_configs ADD CONSTRAINT report_configs_objective_check CHECK (objective IN ('leads','sales','traffic','awareness'));

-- Cached report data so the public panel does not query the ad platforms on every visit.
CREATE TABLE IF NOT EXISTS public.report_cache (
  report_config_id uuid PRIMARY KEY REFERENCES public.report_configs(id) ON DELETE CASCADE,
  data jsonb NOT NULL,
  built_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.report_cache TO service_role;
ALTER TABLE public.report_cache ENABLE ROW LEVEL SECURITY;
-- No client policies: only the server (service role) reads and writes the cache.
