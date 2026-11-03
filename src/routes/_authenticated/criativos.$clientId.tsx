import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, ImageOff, Printer } from "lucide-react";
import { agencyApi } from "@/lib/agency-client";
import { formatMetric } from "@/lib/report-metrics";
import "../../criativos.css";

export const Route = createFileRoute("/_authenticated/criativos/$clientId")({ component: ActiveCreativesPage });

type Ad = {
  id: string;
  name: string;
  account: string;
  campaign: string;
  adset: string;
  image: string | null;
  format: string;
  title: string | null;
  body: string | null;
  cta: string | null;
  link: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  results: number;
};
type Data = { client: { name: string; logo_url: string | null }; ads: Ad[]; errors: string[]; generatedAt: string };

const viaProxy = (src: string) => (/^https:\/\/[^/]*(fbcdn\.net|facebook\.com|fbsbx\.com)\//.test(src) ? "/api/ad-image?u=" + encodeURIComponent(src) : src);

function Picture({ src, alt }: { src: string | null; alt: string }) {
  const [step, setStep] = useState(0);
  if (!src || step > 1) return <div className="crNoImg"><ImageOff size={26} /></div>;
  return <img src={step === 0 ? viaProxy(src) : src} alt={alt} onError={() => setStep((n) => n + 1)} />;
}

/** Ads running now on the client's Meta accounts, grouped by campaign; "Salvar PDF" prints the page. */
function ActiveCreativesPage() {
  const { clientId } = Route.useParams();
  const q = useQuery({ queryKey: ["active-ads", clientId], queryFn: () => agencyApi<Data>(`/api/integrations/clients/${clientId}/active-ads`), staleTime: 5 * 60_000 });
  const groups = useMemo(() => {
    const m = new Map<string, Ad[]>();
    for (const a of q.data?.ads ?? []) m.set(a.campaign, [...(m.get(a.campaign) ?? []), a]);
    return [...m.entries()];
  }, [q.data]);
  const d = q.data;
  const today = new Date().toLocaleDateString("pt-BR");

  return (
    <main className="cr">
      <div className="crBar">
        <Link to="/clientes/$clientId" params={{ clientId }} className="crBtn ghost">
          <ArrowLeft size={16} /> Voltar ao cliente
        </Link>
        <button type="button" className="crBtn" disabled={!d?.ads.length} onClick={() => window.print()}>
          <Printer size={16} /> Salvar PDF
        </button>
      </div>

      <header className="crHero">
        <div className="crWho">
          <span className="crLogo">{d?.client.logo_url ? <img src={d.client.logo_url} alt="" /> : (d?.client.name ?? "").slice(0, 2).toUpperCase()}</span>
          <div>
            <span className="crTag">Anúncios ativos e criativos</span>
            <h1>{d?.client.name ?? "Carregando…"}</h1>
            <p>Meta Ads · situação em {today} · resultados dos últimos 30 dias</p>
          </div>
        </div>
        {d && (
          <div className="crCount">
            <strong>{d.ads.length}</strong>
            <span>anúncio{d.ads.length === 1 ? "" : "s"} ativo{d.ads.length === 1 ? "" : "s"}</span>
          </div>
        )}
      </header>

      <div className="crWrap">
        {q.isLoading && <p className="crState">Buscando os anúncios ativos na Meta…</p>}
        {q.isError && <p className="crState crErr">{q.error instanceof Error ? q.error.message : "Não foi possível carregar."}</p>}
        {d?.errors.map((e) => (
          <p key={e} className="crState crErr">
            {e}
          </p>
        ))}
        {d && !d.ads.length && !d.errors.length && <p className="crState">Nenhum anúncio ativo nas contas da Meta deste cliente agora.</p>}

        {groups.map(([campaign, ads]) => (
          <section key={campaign} className="crGroup">
            <h2>
              {campaign} <small>{ads.length} anúncio{ads.length === 1 ? "" : "s"}</small>
            </h2>
            <div className="crGrid">
              {ads.map((a) => (
                <article key={a.id} className="crCard">
                  <div className="crImg">
                    <Picture src={a.image} alt={a.name} />
                    <span className="crFormat">{a.format}</span>
                  </div>
                  <div className="crBody">
                    <strong className="crName">{a.name}</strong>
                    {a.adset && <small className="crSet">Conjunto: {a.adset}</small>}
                    {a.title && <p className="crTitle">{a.title}</p>}
                    {a.body && <p className="crText">{a.body}</p>}
                    {a.cta && <span className="crCta">Botão: {a.cta}</span>}
                    <dl className="crStats">
                      <div>
                        <dt>Investido</dt>
                        <dd>{formatMetric("spend", a.spend)}</dd>
                      </div>
                      <div>
                        <dt>Impressões</dt>
                        <dd>{formatMetric("impressions", a.impressions)}</dd>
                      </div>
                      <div>
                        <dt>Cliques</dt>
                        <dd>{formatMetric("clicks", a.clicks)}</dd>
                      </div>
                      <div>
                        <dt>Resultados</dt>
                        <dd>{formatMetric("conversions", a.results)}</dd>
                      </div>
                    </dl>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
        {d && <footer className="crFoot">Preparado pela Agência SCASE com dados da Meta Ads · {new Date(d.generatedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</footer>}
      </div>
    </main>
  );
}
