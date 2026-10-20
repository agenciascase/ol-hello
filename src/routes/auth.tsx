import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowUpRight, MailCheck, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import "../performance.css";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search["redirect"] === "string" ? search["redirect"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Entrar — SCASE Performance" },
      { name: "description", content: "Acesse o painel de performance de campanhas da SCASE" },
      { property: "og:title", content: "Entrar — SCASE Performance" },
      { property: "og:description", content: "Acesse o painel de performance de campanhas da SCASE" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function Brand() {
  return (
    <div className="brand">
      <img className="brandOfficial" src="/scase-logo.svg" alt="SCASE • Branding, Design e Performance" />
    </div>
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const { redirect: redirectTo } = Route.useSearch();
  const destination = redirectTo && redirectTo.startsWith("/") ? redirectTo : "/dashboard";

  const [mode, setMode] = useState<"signin" | "signup" | "check-email">("signin");
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: destination, replace: true });
    });
  }, [navigate, destination]);

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInError) {
      setError("E-mail ou senha incorretos. Confira os dados e tente novamente.");
      return;
    }
    navigate({ to: destination, replace: true });
  }

  async function handleSignUp(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, company },
        emailRedirectTo: window.location.origin,
      },
    });
    setBusy(false);
    if (signUpError) {
      setError(
        signUpError.message.includes("already registered")
          ? "Este e-mail já possui cadastro. Entre com sua senha."
          : "Não foi possível criar a conta. Confira os dados e tente novamente."
      );
      return;
    }
    if (data.session) {
      navigate({ to: destination, replace: true });
      return;
    }
    setMode("check-email");
  }

  return (
    <div className="perf login">
      <div className="loginAside">
        <Brand />
        <div>
          <span className="loginTag">INTELIGÊNCIA EM PERFORMANCE</span>
          <h1>
            Dados claros.
            <br />
            Decisões melhores.
            <br />
            <em>Resultados reais.</em>
          </h1>
          <p>Google Ads, Meta Ads e inteligência estratégica no mesmo lugar.</p>
        </div>
        <small>© 2026 SCASE • Plataforma de performance</small>
      </div>
      <div className="loginArea">
        <div className="loginCard">
          {mode === "check-email" ? (
            <>
              <span className="eyebrow">QUASE LÁ</span>
              <h2>Confirme seu e-mail</h2>
              <p>
                Enviamos um link de confirmação para <strong>{email}</strong>. Abra o e-mail e clique no link para
                ativar sua conta.
              </p>
              <div className="demoNote">
                <MailCheck size={16} /> Depois de confirmar, volte aqui e entre com sua senha.
              </div>
              <button className="secondary full" onClick={() => setMode("signin")}>
                Voltar para o login
              </button>
            </>
          ) : (
            <>
              <span className="eyebrow">BEM-VINDO À PLATAFORMA</span>
              <h2>{mode === "signin" ? "Acesse sua conta" : "Crie sua conta"}</h2>
              <p>
                {mode === "signin"
                  ? "Entre para acompanhar o desempenho das campanhas."
                  : "Cadastre-se para acompanhar o desempenho das campanhas."}
              </p>
              <form onSubmit={mode === "signin" ? handleSignIn : handleSignUp}>
                {mode === "signup" && (
                  <>
                    <label>
                      Nome completo
                      <input
                        placeholder="Seu nome"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                      />
                    </label>
                    <label>
                      Empresa
                      <input
                        placeholder="Nome da empresa"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        required
                      />
                    </label>
                  </>
                )}
                <label>
                  E-mail
                  <input
                    placeholder="voce@empresa.com.br"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Senha
                  <input
                    placeholder={mode === "signup" ? "Mínimo de 6 caracteres" : "Sua senha"}
                    type="password"
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </label>
                {error && <div className="demoNote authError">{error}</div>}
                <button className="primary full" type="submit" disabled={busy}>
                  {busy ? "Aguarde…" : mode === "signin" ? "Entrar" : "Criar conta"} <ArrowUpRight size={17} />
                </button>
              </form>
              <button
                className="secondary full"
                onClick={() => {
                  setMode(mode === "signin" ? "signup" : "signin");
                  setError(null);
                }}
              >
                {mode === "signin" ? "Ainda não tenho conta" : "Já tenho conta"}
              </button>
              <div className="demoNote">
                <ShieldCheck size={16} /> Acesso protegido. Seus dados ficam visíveis apenas para você.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
