import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { LayoutDashboard, Link2, LogOut, Menu, Users, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { currentUserIsAdmin } from "@/lib/agency-client";
import "../../performance.css";
import "../../reports.css";

const NAV = [
  { to: "/dashboard", label: "Visão geral", icon: <LayoutDashboard size={18} /> },
  { to: "/clientes", label: "Clientes e relatórios", icon: <Users size={18} /> },
  { to: "/integracoes", label: "Integrações", icon: <Link2 size={18} /> },
] as const;

/** Layout for the agency-only screens (clients, reports, integrations). */
export function AgencyShell({ title, eyebrow, description, actions, children }: { title: string; eyebrow?: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const admin = useQuery({ queryKey: ["agency-is-admin"], queryFn: currentUserIsAdmin, staleTime: 5 * 60_000 });

  return (
    <div className="perf appShell themeLight">
      {open && <div className="mobileShade" onClick={() => setOpen(false)} />}
      <aside className={"side " + (open ? "sideOpen" : "")}>
        <div className="sideBrand">
          <div className="brand">
            <img className="brandOfficial" src="/scase-logo-light.svg" alt="SCASE • Branding, Design e Performance" />
          </div>
          <button className="iconButton mobileOnly" onClick={() => setOpen(false)} aria-label="Fechar menu">
            <X size={18} />
          </button>
        </div>
        <div className="agencyTag">
          <span className="signal" /> ESPAÇO DA AGÊNCIA
        </div>
        <div className="navLabel">MENU PRINCIPAL</div>
        <nav>
          {NAV.map((item) => (
            <Link key={item.to} to={item.to} className="navItem" activeProps={{ className: "navItem navActive" }} onClick={() => setOpen(false)}>
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="sideBottom">
          <button
            className="userBox"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth", search: { redirect: undefined, mode: undefined } as never });
            }}
            title="Sair da conta"
          >
            <span className="userDesc">
              <strong>Agência SCASE</strong>
              <small>Sair da conta</small>
            </span>
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="body">
        <header className="topbar">
          <button className="iconButton mobileOnly" onClick={() => setOpen(true)} aria-label="Abrir menu">
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            SCASE<span>/</span>
            {title}
          </div>
          <div />
        </header>
        <main className="main">
          <div className="heading">
            <div>
              {eyebrow && <span className="eyebrow">{eyebrow}</span>}
              <h1>{title}</h1>
              {description && <p>{description}</p>}
            </div>
            {actions && <div className="headingActions rpActions">{actions}</div>}
          </div>
          {admin.isLoading ? (
            <section className="panel rpEmpty">Verificando acesso…</section>
          ) : admin.data ? (
            children
          ) : (
            <section className="panel rpEmpty">
              <h2>Acesso restrito à equipe da agência</h2>
              <p>Esta área só aparece para usuários com papel de administrador da SCASE.</p>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
