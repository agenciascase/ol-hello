import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowUpRight, MailCheck, ShieldCheck, BarChart3, Target, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import "../performance.css";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search["redirect"] === "string" ? search["redirect"] : undefined,
    mode: search["mode"] === "reset" ? "reset" : undefined,
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
  const { redirect: redirectTo, mode: searchMode } = Route.useSearch();
  const destination = redirectTo && redirectTo.startsWith("/") ? redirectTo : "/dashboard";

  const [mode, setMode] = useState<"signin" | "signup" | "check-email" | "forgot" | "reset" | "sent-reset">(searchMode === "reset" ? "reset" : "signin");
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session && searchMode !== "reset") navigate({ to: destination, replace: true });
    });
  }, [navigate, destination]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setMode("reset");
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleForgotPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + "/auth?mode=reset",
    });
    setBusy(false);
    if (resetError) {
      setError("Não foi possível solicitar a recuperação. Aguarde um pouco e tente novamente.");
      return;
    }
    setMode("sent-reset");
  }

  async function handleNewPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError("O link pode estar inválido ou expirado. Solicite uma nova recuperação de senha.");
      return;
    }
    setPassword("");
    navigate({ to: "/dashboard", replace: true });
  }

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
          <div className="loginBenefits" aria-label="Benefícios da plataforma">
            <div><span><BarChart3 size={23} /></span><strong>Mais<br/>desempenho</strong></div>
            <div><span><Target size={23} /></span><strong>Decisões<br/>mais rápidas</strong></div>
            <div><span><TrendingUp size={23} /></span><strong>Crescimento<br/>sustentável</strong></div>
          </div>
          <div className="loginDashboardArt" aria-hidden="true">
            <div className="loginDashboardHeading"><span>VISÃO DE PERFORMANCE</span><span>● EM ALTA</span></div>
            <div className="loginSparkBars">{[28,41,34,49,44,61,57,73,67,86,79,100].map((h,i)=><i key={i} style={{height: h + "%"}} />)}</div>
            <div className="loginDashboardFooter"><span>Desempenho das campanhas</span><strong>↗ +24,8%</strong></div>
          </div>
        </div>
        <small>© 2026 SCASE • Plataforma de performance</small>
      </div>
      <div className="loginArea">
        <div className="loginCard">
          {mode === "forgot" || mode === "sent-reset" ? (
            <>
              <span className="eyebrow">RECUPERAÇÃO DE ACESSO</span>
              <h2>{mode === "forgot" ? "Esqueceu sua senha?" : "Confira seu e-mail"}</h2>
              <p>{mode === "forgot"
                ? "Informe o e-mail da sua conta para receber um link de redefinição."
                : "Se existir uma conta cadastrada para este e-mail, enviaremos as instruções para redefinir sua senha."}</p>
              {mode === "forgot" && (
                <form onSubmit={handleForgotPassword}>
                  <label>E-mail
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="voce@empresa.com.br" />
                  </label>
                  {error && <div className="demoNote authError">{error}</div>}
                  <button className="primary full" type="submit" disabled={busy}>{busy ? "Enviando…" : "Enviar link de recuperação"}</button>
                </form>
              )}
              <button className="secondary full" type="button" onClick={() => { setMode("signin"); setError(null); }}>Voltar para o login</button>
            </>
          ) : mode === "reset" ? (
            <>
              <span className="eyebrow">RECUPERAÇÃO DE ACESSO</span>
              <h2>Defina uma nova senha</h2>
              <p>Digite sua nova senha após abrir o link de recuperação recebido por e-mail.</p>
              <form onSubmit={handleNewPassword}>
                <label>Nova senha
                  <input type="password" minLength={8} value={password} onChange={e => setPassword(e.target.value)} required placeholder="Mínimo de 8 caracteres" />
                </label>
                {error && <div className="demoNote authError">{error}</div>}
                <button className="primary full" type="submit" disabled={busy}>{busy ? "Salvando…" : "Atualizar senha"}</button>
              </form>
              <button className="secondary full" type="button" onClick={() => {setMode("forgot"); setError(null);}}>Solicitar outro link</button>
            </>
          ) : mode === "check-email" ? (
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
              {mode === "signin" && <button className="secondary full" type="button" onClick={() => { setMode("forgot"); setError(null); }}>Esqueci minha senha</button>}
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
