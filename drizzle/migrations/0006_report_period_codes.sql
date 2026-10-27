-- Report periods: rolling presets (today, this_week, days_today_N…) and fixed custom ranges.
ALTER TABLE public.report_configs DROP CONSTRAINT IF EXISTS report_configs_period_check;
ALTER TABLE public.report_configs ADD CONSTRAINT report_configs_period_check CHECK (period ~ '^(last_7_days|last_30_days|previous_month|previous_week|month_to_yesterday|today|yesterday|this_week|last_week|this_month|last_month|last_12_months|days_(today|yesterday)_[1-9][0-9]{0,2}|custom_[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{4}-[0-9]{2}-[0-9]{2})$');
