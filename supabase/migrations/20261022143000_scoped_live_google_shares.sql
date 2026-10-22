-- Run once in Lovable Cloud SQL Editor to enable scoped live Google reports.
CREATE TABLE IF NOT EXISTS public.scase_live_google_shares (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 customer_id text NOT NULL CHECK (customer_id ~ '^[0-9]{10}$'),
 customer_name text NOT NULL,
 token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL DEFAULT (now()+interval '30 days'),
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.scase_live_google_shares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scase_live_google_shares FROM anon, authenticated;
CREATE OR REPLACE FUNCTION public.scase_create_live_google_share(p_customer_id text,p_customer_name text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE secret text;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin') THEN
  RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
 END IF;
 IF p_customer_id !~ '^[0-9]{10}$' OR length(p_customer_name) NOT BETWEEN 1 AND 200 THEN
  RAISE EXCEPTION 'Invalid account' USING ERRCODE='22023';
 END IF;
 secret:=encode(extensions.gen_random_bytes(32),'hex');
 INSERT INTO public.scase_live_google_shares(owner_id,customer_id,customer_name,token_hash)
 VALUES(auth.uid(),p_customer_id,p_customer_name,encode(extensions.digest(secret,'sha256'),'hex'));
 RETURN secret;
END $$;
CREATE OR REPLACE FUNCTION public.scase_read_live_google_share(p_token text)
RETURNS TABLE(customer_id text, customer_name text, access_token_ciphertext text, refresh_token_ciphertext text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN RETURN; END IF;
 RETURN QUERY SELECT s.customer_id,s.customer_name,c.access_token_ciphertext,c.refresh_token_ciphertext,c.expires_at
 FROM public.scase_live_google_shares s JOIN public.ads_connections c
 ON c.owner_id=s.owner_id AND c.provider='google'
 WHERE s.token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
 AND s.revoked_at IS NULL AND s.expires_at>now()
 LIMIT 1;
END $$;
CREATE OR REPLACE FUNCTION public.scase_revoke_live_google_share(p_token text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin') THEN
  RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
 END IF;
 UPDATE public.scase_live_google_shares SET revoked_at=now()
 WHERE owner_id=auth.uid() AND token_hash=encode(extensions.digest(p_token,'sha256'),'hex') AND revoked_at IS NULL;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.scase_create_live_google_share(text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.scase_read_live_google_share(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.scase_revoke_live_google_share(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.scase_create_live_google_share(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.scase_read_live_google_share(text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.scase_revoke_live_google_share(text) TO authenticated;
