-- Delivery channels connected from the Integrations page. Credentials are encrypted by the server
-- (AES-256-GCM with SCASE_TOKEN_ENCRYPTION_KEY) and only the service role can read this table.
CREATE TABLE IF NOT EXISTS public.delivery_channels (
  channel text PRIMARY KEY CHECK (channel IN ('email','whatsapp')),
  config_ciphertext text NOT NULL,
  public_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.delivery_channels TO service_role;
ALTER TABLE public.delivery_channels ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.delivery_channels FROM anon, authenticated;
