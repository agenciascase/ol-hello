CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  logo_url text,
  owner_name text,
  emails text[] NOT NULL DEFAULT '{}',
  whatsapp_numbers text[] NOT NULL DEFAULT '{}',
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ad_accounts_catalog (
  provider text NOT NULL CHECK (provider IN ('meta','google')),
  account_id text NOT NULL,
  name text NOT NULL,
  currency text,
  status text,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, account_id)
);
CREATE TABLE public.client_ad_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('meta','google')),
  account_id text NOT NULL,
  account_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, provider, account_id)
);
CREATE TABLE public.report_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  platforms text[] NOT NULL DEFAULT '{meta,google}',
  metrics text[] NOT NULL DEFAULT '{spend,impressions,clicks,ctr,cpc,conversions}',
  period text NOT NULL DEFAULT 'last_7_days' CHECK (period IN ('last_7_days','last_30_days','previous_month','previous_week','month_to_yesterday')),
  compare_previous boolean NOT NULL DEFAULT true,
  campaign_filter text,
  intro_message text,
  channels text[] NOT NULL DEFAULT '{email}',
  share_token text UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.report_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_config_id uuid NOT NULL REFERENCES public.report_configs(id) ON DELETE CASCADE,
  frequency text NOT NULL CHECK (frequency IN ('weekly','biweekly','monthly')),
  weekdays int[] NOT NULL DEFAULT '{1}',
  day_of_month int CHECK (day_of_month BETWEEN 1 AND 31),
  send_time time NOT NULL DEFAULT '09:00',
  next_run_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.report_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_config_id uuid NOT NULL REFERENCES public.report_configs(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now(),
  channel text NOT NULL CHECK (channel IN ('email','whatsapp')),
  recipient text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  error text,
  report_url text
);
CREATE INDEX ON public.client_ad_accounts(client_id);
CREATE INDEX ON public.report_configs(client_id);
CREATE INDEX ON public.report_schedules(report_config_id);
CREATE INDEX ON public.report_schedules(next_run_at) WHERE active;
CREATE INDEX ON public.report_deliveries(report_config_id, sent_at DESC);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['clients','ad_accounts_catalog','client_ad_accounts','report_configs','report_schedules','report_deliveries'] LOOP
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('CREATE POLICY "Agency admins manage %s" ON public.%I FOR ALL TO authenticated USING (public.has_role(auth.uid(), ''admin'')) WITH CHECK (public.has_role(auth.uid(), ''admin''))', t, t);
 END LOOP;
END $$;