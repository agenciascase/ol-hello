import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FileBarChart2, Link2, Mail, MessageCircle, Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AgencyShell } from "@/components/agency/AgencyShell";
import { CLIENT_COLUMNS, ClientForm, type ClientRow } from "@/components/agency/ClientForm";
import { QuickClientAdd } from "@/components/agency/QuickClientAdd";

export const Route = createFileRoute("/_authenticated/clientes/")({ component: ClientsPage });

type ClientListRow = ClientRow & { client_ad_accounts: { provider: string }[]; report_configs: { id: string; active: boolean }[] };

function ClientsPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"active" | "inactive" | "all">("active");
  const [creating, setCreating] = useState(false);
  const clients = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select(CLIENT_COLUMNS + ",client_ad_accounts(provider),report_configs(id,active)")
        .order("name");
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ClientListRow[];
    },
  });

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (clients.data ?? []).filter(
      (c) => (status === "all" || (status === "active") === c.active) && (!q || c.name.toLowerCase().includes(q) || (c.owner_name ?? "").toLowerCase().includes(q)),
    );
  }, [clients.data, query, status]);

  return (
    <AgencyShell
      eyebrow="CARTEIRA DA AGÊNCIA"
      title="Clientes"
      description="Cadastre pelo número da conta do Google ou pelo ID da BM da Meta."
      actions={
        <button className="primary" type="button" onClick={() => setCreating(true)}>
          <Plus size={16} /> Cadastro manual
        </button>
      }
    >
      <QuickClientAdd onCreated={(id) => navigate({ to: "/clientes/$clientId", params: { clientId: id } })} />

      <div className="rpToolbar">
        <label className="searchBox rpSearch">
          <Search size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar cliente ou responsável" />
        </label>
        <div className="periods">
          {(
            [
              ["active", "Ativos"],
              ["inactive", "Inativos"],
              ["all", "Todos"],
            ] as const
          ).map(([v, l]) => (
            <button key={v} type="button" className={status === v ? "chosen" : ""} onClick={() => setStatus(v)}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {clients.isLoading ? (
        <section className="panel rpEmpty">Carregando clientes…</section>
      ) : clients.isError ? (
        <section className="panel rpEmpty">
          <p className="rpError">{(clients.error as Error).message}</p>
        </section>
      ) : list.length === 0 ? (
        <section className="panel rpEmpty">
          <h2>{clients.data?.length ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado ainda"}</h2>
          <p>Use o cadastro pela conta acima: digite o número da conta Google ou o ID da BM da Meta.</p>
        </section>
      ) : (
        <div className="clientsGrid">
          {list.map((c) => {
            const meta = c.client_ad_accounts.filter((a) => a.provider === "meta").length;
            const google = c.client_ad_accounts.filter((a) => a.provider === "google").length;
            const reports = c.report_configs.filter((r) => r.active).length;
            return (
              <Link key={c.id} to="/clientes/$clientId" params={{ clientId: c.id }} className="panel rpClientCard">
                <div className="rpClientTop">
                  <span className="rpAvatar">{c.logo_url ? <img src={c.logo_url} alt="" /> : c.name.slice(0, 2).toUpperCase()}</span>
                  <div className="rpRowMain">
                    <strong>{c.name}</strong>
                    <small>{c.owner_name || "Sem responsável definido"}</small>
                  </div>
                  {!c.active && <span className="rpBadge">Inativo</span>}
                </div>
                <div className="rpMeta">
                  <span className={"rpBadge " + (meta + google ? "" : "warn")}>
                    <Link2 size={11} /> {meta} Meta · {google} Google
                  </span>
                  <span className={"rpBadge " + (reports ? "ok" : "")}>
                    <FileBarChart2 size={11} /> {reports} relatório{reports === 1 ? "" : "s"}
                  </span>
                  <span className="rpBadge">
                    <Mail size={11} /> {c.emails.length}
                  </span>
                  <span className="rpBadge">
                    <MessageCircle size={11} /> {c.whatsapp_numbers.length}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {creating && (
        <ClientForm
          onClose={() => setCreating(false)}
          onSaved={(id) => {
            setCreating(false);
            navigate({ to: "/clientes/$clientId", params: { clientId: id } });
          }}
        />
      )}
    </AgencyShell>
  );
}
