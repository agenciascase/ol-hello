import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { agencyApi } from "@/lib/agency-client";
import { PlatformMark } from "./PlatformMark";

export type CampaignMode = "all" | "active" | "selected";
type Option = { key: string; platform: "google" | "meta"; id: string; name: string; active: boolean; account: string };

const MODES: Array<[CampaignMode, string, string]> = [
  ["all", "Todas", "Todas as campanhas das contas do cliente"],
  ["active", "Só as ativas", "Apenas campanhas ativas no momento do envio"],
  ["selected", "Escolher campanhas", "Só as campanhas que você marcar abaixo"],
];

/** Which campaigns a report shows: all, only active ones, or a hand-picked list per platform. */
export function CampaignScope({
  clientId,
  platforms,
  mode,
  onMode,
  selected,
  onSelected,
}: {
  clientId: string;
  platforms: string[];
  mode: CampaignMode;
  onMode: (m: CampaignMode) => void;
  selected: string[];
  onSelected: (keys: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [onlyActive, setOnlyActive] = useState(true);
  const list = useQuery({
    queryKey: ["client-campaigns", clientId],
    enabled: mode === "selected",
    staleTime: 5 * 60_000,
    queryFn: () => agencyApi<{ campaigns: Option[]; errors: string[] }>(`/api/integrations/clients/${clientId}/campaigns`),
  });
  const rows = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("pt-BR");
    return (list.data?.campaigns ?? [])
      .filter((c) => platforms.includes(c.platform))
      .filter((c) => !onlyActive || c.active || selected.includes(c.key))
      .filter((c) => !q || c.name.toLocaleLowerCase("pt-BR").includes(q) || c.id.includes(q));
  }, [list.data, platforms, onlyActive, query, selected]);
  const toggle = (k: string) => onSelected(selected.includes(k) ? selected.filter((x) => x !== k) : [...selected, k]);

  return (
    <div className="rpField">
      <span>Campanhas do relatório</span>
      <div className="csModes" role="radiogroup">
        {MODES.map(([m, label, hint]) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} className="rpObjective" onClick={() => onMode(m)}>
            <strong>{label}</strong>
            <small>{hint}</small>
          </button>
        ))}
      </div>
      {mode === "selected" && (
        <div className="csBox">
          <div className="csTools">
            <label className="searchBox rpSearch">
              <Search size={15} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar campanha pelo nome ou ID" />
            </label>
            <label className="csOnly">
              <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} /> Mostrar só ativas
            </label>
          </div>
          {list.isLoading ? (
            <p className="csNote">Buscando as campanhas das contas do cliente…</p>
          ) : list.isError ? (
            <p className="rpError">{list.error instanceof Error ? list.error.message : "Não foi possível listar as campanhas."}</p>
          ) : (
            <>
              {(list.data?.errors ?? []).map((e) => (
                <p key={e} className="rpError">
                  {e}
                </p>
              ))}
              <div className="csList">
                {rows.map((c) => (
                  <label key={c.key} className="csRow">
                    <input type="checkbox" checked={selected.includes(c.key)} onChange={() => toggle(c.key)} />
                    <PlatformMark platform={c.platform} size={16} />
                    <span>
                      <strong>{c.name}</strong>
                      <small>
                        {c.account} · {c.active ? "ativa" : "pausada"}
                      </small>
                    </span>
                  </label>
                ))}
                {rows.length === 0 && <p className="csNote">Nenhuma campanha encontrada{onlyActive ? " entre as ativas" : ""}.</p>}
              </div>
              <small className="csNote">
                {selected.length} campanha{selected.length === 1 ? "" : "s"} marcada{selected.length === 1 ? "" : "s"}. Plataformas sem campanha marcada ficam de fora deste relatório.
              </small>
            </>
          )}
        </div>
      )}
    </div>
  );
}
