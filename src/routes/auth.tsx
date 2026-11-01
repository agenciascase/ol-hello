import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, ShieldCheck, BarChart3, Target, TrendingUp, Mail, LockKeyhole, Eye, EyeOff, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import "../performance.css";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search["redirect"] === "string" ? search["redirect"] : undefined,
    mode: search["mode"] === "reset" ? "reset" : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Entrar — SCASE HUB" },
      { name: "description", content: "HUB da SCASE: clientes, campanhas, otimizações e relatórios num lugar só" },
      { property: "og:title", content: "Entrar — SCASE HUB" },
      { property: "og:description", content: "HUB da SCASE: clientes, campanhas, otimizações e relatórios num lugar só" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function Brand() {
  return (
    <div className="brand">
      <img className="brandOfficial" src="/scase-logo-light.svg" alt="SCASE • Branding, Design e Performance" />
    </div>
  );
}

// Acesso do HUB: uma conta só. A tela pede e-mail e senha, com o e-mail EM BRANCO (não vem preenchido).
// No primeiro acesso a senha é criada com o código de instalação; depois só existe "Entrar".
// Não há cadastro, troca nem recuperação de senha pelo sistema.
function AuthPage() {
  const navigate = useNavigate();
  const { redirect: redirectTo } = Route.useSearch();
  const destination = redirectTo && redirectTo.startsWith("/") ? redirectTo : "/dashboard";

  const [mode, setMode] = useState<"carregando" | "criar" | "entrar" | "indisponivel">("carregando");
  const [email, setEmail] = useState("");
  const [detalhe, setDetalhe] = useState<string[]>([]);
  const [codigo, setCodigo] = useState("");
  const [password, setPassword] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: destination, replace: true });
    });
  }, [navigate, destination]);

  useEffect(() => {
    fetch("/api/hub/acesso", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ senhaCriada?: boolean; detalhe?: string[] }>)
      .then((d) => {
        setDetalhe(Array.isArray(d.detalhe) ? d.detalhe : []);
        setMode(d.senhaCriada === false ? "criar" : d.senhaCriada === true ? "entrar" : "indisponivel");
      })
      .catch(() => setMode("indisponivel"));
  }, []);

  // O servidor completa o e-mail e devolve a sessão; o navegador nunca vê o e-mail.
  async function entrar(senha: string) {
    // o servidor confere e-mail e senha e devolve a sessão
    const r = await fetch("/api/hub/entrar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email.trim(), senha }),
    }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      error?: string;
    } | undefined;
    if (!r?.ok || !d?.access_token || !d.refresh_token) {
      setError(d?.error || "Não consegui entrar agora. Tente de novo.");
      return false;
    }
    const { error: sessaoErro } = await supabase.auth.setSession({
      access_token: d.access_token,
      refresh_token: d.refresh_token,
    });
    if (sessaoErro) {
      setError("Não consegui abrir a sessão. Tente de novo.");
      return false;
    }
    navigate({ to: destination, replace: true });
    return true;
  }

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    await entrar(password);
    setBusy(false);
  }

  async function handleCriar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 10) return setError("A senha precisa ter pelo menos 10 caracteres.");
    if (password !== confirmacao) return setError("As duas senhas não são iguais.");
    if (!email.trim()) return setError("Digite o e-mail.");
    if (!codigo.trim()) return setError("Digite o código de instalação.");
    setBusy(true);
    const r = await fetch("/api/hub/acesso", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: email.trim(), senha: password, codigo: codigo.trim() }) });
    const d = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) {
      setBusy(false);
      if (r.status === 409) setMode("entrar");
      setError(d.error || "Não consegui criar a senha agora. Tente de novo.");
      return;
    }
    await entrar(password);
    setBusy(false);
  }

  const campoSenha = (valor: string, mudar: (v: string) => void, rotulo: string, dica: string, auto: string) => (
    <label>{rotulo}
      <span className="loginInputWrap"><LockKeyhole size={19} aria-hidden="true" />
        <input placeholder={dica} type={showPassword ? "text" : "password"} autoComplete={auto} minLength={mode === "criar" ? 10 : 1} value={valor} onChange={(e) => mudar(e.target.value)} required />
        <button className="passwordToggle" type="button" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button>
      </span>
    </label>
  );

  const campoEmail = (
    <label>E-mail
      <span className="loginInputWrap"><Mail size={19} aria-hidden="true" />
        <input type="email" placeholder="Seu e-mail" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </span>
    </label>
  );

  return (
    <div className="perf login">
      <div className="loginAside">
        <Brand />
        <div>
          <span className="loginTag">SCASE HUB · INTELIGÊNCIA EM PERFORMANCE</span>
          <h1>
            Dados claros.
            <br />
            Decisões melhores.
            <br />
            <em>Resultados reais.</em>
          </h1>
          <p>Clientes, campanhas, otimizações e relatórios do Google Ads e da Meta Ads no mesmo lugar.</p>
          <div className="loginBenefits" aria-label="Benefícios da plataforma">
            <div><span><BarChart3 size={23} /></span><strong>Mais<br/>desempenho</strong></div>
            <div><span><Target size={23} /></span><strong>Decisões<br/>mais rápidas</strong></div>
            <div><span><TrendingUp size={23} /></span><strong>Crescimento<br/>sustentável</strong></div>
          </div>
          <div className="loginDashboardArt" aria-hidden="true">
            <div className="loginDashboardHeading"><span>VISÃO DE PERFORMANCE</span><span>● EM ALTA</span></div>
            <div className="loginGraph"><div className="loginSparkBars">{[28,41,34,49,44,61,57,73,67,86,79,100].map((h,i)=><i key={i} style={{height: h + "%"}} />)}</div><svg className="loginTrend" viewBox="0 0 460 132" preserveAspectRatio="none"><polyline points="0,122 40,108 79,112 110,71 141,80 180,62 218,69 259,44 290,38 320,51 353,21 400,16 460,0" /></svg><div className="loginGraphStats"><span>Conversões <b>+12,5%</b></span><span>Investimento <b>-8,3%</b></span><span>Receita <b>+32,1%</b></span></div></div>
            <div className="loginDonutCard"><i className="loginDonut" /><span><b /><b /><b /></span></div>
          </div>
        </div>
        <small>© 2026 SCASE • HUB de performance</small>
      </div>
      <div className="loginArea">
        <div className="loginCard">
          {mode === "carregando" ? (
            <p className="loginSubtitle">Verificando acesso…</p>
          ) : mode === "indisponivel" ? (
            <>
              <h2 className="loginTitle">HUB indisponível</h2>
              <p className="loginSubtitle">O HUB não conseguiu falar com o banco de dados. Tente de novo em alguns minutos; se continuar, confira as variáveis do servidor na Hostinger.</p>
              {detalhe.length > 0 && (
                <div className="demoNote authError">
                  <strong>O que conferir:</strong>
                  <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                    {detalhe.map((d) => <li key={d}>{d}</li>)}
                  </ul>
                </div>
              )}
            </>
          ) : mode === "criar" ? (
            <>
              <span className="eyebrow">PRIMEIRO ACESSO</span>
              <h2 className="loginTitle">Crie a senha do HUB</h2>
              <p className="loginSubtitle">Esta senha é criada uma única vez e não pode ser trocada nem recuperada depois. Guarde em um lugar seguro.</p>
              <form onSubmit={handleCriar}>
                {campoEmail}
                {campoSenha(codigo, setCodigo, "Código de instalação", "O código que está no servidor", "off")}
                {campoSenha(password, setPassword, "Senha", "Mínimo de 10 caracteres", "new-password")}
                {campoSenha(confirmacao, setConfirmacao, "Repita a senha", "Digite a mesma senha", "new-password")}
                {error && <div className="demoNote authError">{error}</div>}
                <button className="primary full" type="submit" disabled={busy}>
                  {busy ? "Aguarde…" : "Criar senha e entrar"} <KeyRound size={19} />
                </button>
              </form>
              <div className="demoNote">
                <ShieldCheck size={16} /> Depois de criada, só esta senha abre o HUB.
              </div>
            </>
          ) : (
            <>
              <h2 className="loginTitle">Acesse o HUB</h2>
              <p className="loginSubtitle">Clientes, campanhas, otimizações e relatórios da Scase num lugar só.</p>
              <form onSubmit={handleSignIn}>
                {campoEmail}
                {campoSenha(password, setPassword, "Senha", "Sua senha", "current-password")}
                {error && <div className="demoNote authError">{error}</div>}
                <button className="primary full" type="submit" disabled={busy}>
                  {busy ? "Aguarde…" : "Entrar"} <ArrowRight size={19} />
                </button>
              </form>
              <div className="demoNote">
                <ShieldCheck size={16} /> Acesso exclusivo da equipe Scase. Conexão protegida.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
