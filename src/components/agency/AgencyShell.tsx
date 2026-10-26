import { useNavigate, useRouterState } from "@tanstack/react-router";
import { AgencySidebar } from "./AgencySidebar";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { currentUserIsAdmin } from "@/lib/agency-client";
import "../../performance.css";
import "../../reports.css";
import "../../agency.css";


export type MastStat = { value: string; label: string };

/** Rising bars with a trend line: the growth motif drawn behind each page title. */
function GrowthMotif() {
  const bars = [18, 26, 22, 34, 31, 44, 40, 55, 52, 66, 63, 78];
  const w = 30;
  const gap = 12;
  const h = 120;
  const pts = bars.map((b, i) => `${i * (w + gap) + w / 2},${h - b - 10}`).join(" ");
  return (
    <svg className="agMotif" viewBox={`0 0 ${bars.length * (w + gap)} ${h}`} preserveAspectRatio="xMaxYMax meet" aria-hidden>
      {bars.map((b, i) => (
        <rect key={i} x={i * (w + gap)} y={h - b} width={w} height={b} rx={4} />
      ))}
      <polyline points={pts} />
      <circle cx={(bars.length - 1) * (w + gap) + w / 2} cy={h - (bars[bars.length - 1] ?? 0) - 10} r={5} />
    </svg>
  );
}

/** Layout for the agency-only screens (clients, reports, integrations). */
export function AgencyShell({
  title,
  description,
  actions,
  stats,
  children,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  actions?: ReactNode;
  stats?: MastStat[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (st) => st.location.pathname });
  const admin = useQuery({ queryKey: ["agency-is-admin"], queryFn: currentUserIsAdmin, staleTime: 5 * 60_000 });

  return (
    <div className="perf ag">
      {open && <div className="agShade" onClick={() => setOpen(false)} />}
      <AgencySidebar
        active={pathname.startsWith("/integracoes") ? "integrations" : pathname.startsWith("/clientes") ? "clients" : "dashboard"}
        open={open}
        onClose={() => setOpen(false)}
        user={{ name: "Agência SCASE", subtitle: "Sair da conta", initials: "SC" }}
        onSignOut={async () => {
          await supabase.auth.signOut();
          navigate({ to: "/auth", search: { redirect: undefined, mode: undefined } as never });
        }}
      />

      <div className="agMain">
        <header className="agMast">
          <GrowthMotif />
          <div className="agMastInner">
            <button className="agIcon agMobile agMenu" onClick={() => setOpen(true)} aria-label="Abrir menu">
              <Menu size={20} />
            </button>
            <div className="agMastText">
              <h1>{title}</h1>
              {description && <p>{description}</p>}
            </div>
            {actions && <div className="agMastActions">{actions}</div>}
          </div>
          {stats && stats.length > 0 && (
            <dl className="agStats">
              {stats.map((s) => (
                <div key={s.label}>
                  <dt>{s.label}</dt>
                  <dd>{s.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </header>
        <main className="agContent">
          {admin.isLoading ? (
            <section className="agEmpty">Verificando acesso…</section>
          ) : admin.data ? (
            children
          ) : (
            <section className="agEmpty">
              <h2>Área da equipe SCASE</h2>
              <p>Entre com uma conta de administrador da agência para ver clientes, relatórios e integrações.</p>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
