import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { LayoutDashboard, Link2, LogOut, Menu, Users, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { currentUserIsAdmin } from "@/lib/agency-client";
import "../../performance.css";
import "../../reports.css";
import "../../agency.css";

const NAV = [
  { to: "/dashboard", label: "Visão geral", icon: <LayoutDashboard size={18} /> },
  { to: "/clientes", label: "Clientes e relatórios", icon: <Users size={18} /> },
  { to: "/integracoes", label: "Integrações", icon: <Link2 size={18} /> },
] as const;

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
  const admin = useQuery({ queryKey: ["agency-is-admin"], queryFn: currentUserIsAdmin, staleTime: 5 * 60_000 });

  return (
    <div className="perf ag">
      {open && <div className="agShade" onClick={() => setOpen(false)} />}
      <aside className={"agSide" + (open ? " open" : "")}>
        <div className="agBrand">
          <img src="/scase-logo-light.svg" alt="SCASE · Branding, design e performance" />
          <button className="agIcon agMobile" onClick={() => setOpen(false)} aria-label="Fechar menu">
            <X size={18} />
          </button>
        </div>
        <nav className="agNav" aria-label="Menu principal">
          {NAV.map((item) => (
            <Link key={item.to} to={item.to} className="agNavItem" activeProps={{ className: "agNavItem active" }} onClick={() => setOpen(false)}>
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <button
          className="agSignOut"
          onClick={async () => {
            await supabase.auth.signOut();
            navigate({ to: "/auth", search: { redirect: undefined, mode: undefined } as never });
          }}
        >
          <span>
            <strong>Agência SCASE</strong>
            <small>Sair da conta</small>
          </span>
          <LogOut size={17} />
        </button>
      </aside>

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
