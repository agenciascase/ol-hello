-- Server-mediated OAuth credential storage, without a service-role key in the app server.
-- Run in Lovable Cloud SQL editor before enabling Google connection.
-- Every RPC checks the authenticated JWT and the agency admin role.
CREATE OR REPLACE FUNCTION public.scase_ads_connection_get(p_provider text)
RETURNS TABLE(access_token_ciphertext text, refresh_token_ciphertext text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_provider <> 'google' THEN
    RAISE EXCEPTION 'Unsupported provider' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY SELECT c.access_token_ciphertext, c.refresh_token_ciphertext, c.expires_at
  FROM public.ads_connections AS c
  WHERE c.provider = p_provider AND c.owner_id = auth.uid()
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.scase_ads_connection_put(
  p_provider text,
  p_access_token_ciphertext text,
  p_refresh_token_ciphertext text,
  p_expires_at timestamptz
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_provider <> 'google'
    OR p_access_token_ciphertext IS NULL OR length(p_access_token_ciphertext) < 20
    OR p_expires_at IS NULL THEN
    RAISE EXCEPTION 'Invalid credential data' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.ads_connections (
    provider, owner_id, access_token_ciphertext, refresh_token_ciphertext, expires_at, updated_at
  ) VALUES (
    p_provider, auth.uid(), p_access_token_ciphertext, p_refresh_token_ciphertext, p_expires_at, now()
  )
  ON CONFLICT (provider, owner_id) DO UPDATE
    SET access_token_ciphertext = EXCLUDED.access_token_ciphertext,
        refresh_token_ciphertext = COALESCE(EXCLUDED.refresh_token_ciphertext, public.ads_connections.refresh_token_ciphertext),
        expires_at = EXCLUDED.expires_at,
        updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.scase_ads_connection_get(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.scase_ads_connection_put(text,text,text,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scase_ads_connection_get(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.scase_ads_connection_put(text,text,text,timestamptz) TO authenticated;
