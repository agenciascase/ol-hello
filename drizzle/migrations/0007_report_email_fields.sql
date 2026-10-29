-- Per-report e-mail: own recipients (falls back to the client's e-mails) and subject.
-- The message body reuses intro_message.
ALTER TABLE public.report_configs
  ADD COLUMN IF NOT EXISTS email_subject text CHECK (email_subject IS NULL OR length(email_subject) <= 200),
  ADD COLUMN IF NOT EXISTS email_to text[] NOT NULL DEFAULT '{}';
