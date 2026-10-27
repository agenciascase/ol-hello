import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LayoutDashboard, Link2, LogOut, Settings, Users, X } from "lucide-react";
import "../../agency.css";

export type SideKey = "dashboard" | "clients" | "integrations" | "settings";

type Item = { key: SideKey; label: string; icon: ReactNode; adminOnly?: boolean; to: "/dashboard" | "/clientes" | "/integracoes"; view?: "settings" };
const ITEMS: Item[] = [
  { key: "dashboard", label: "Visão geral", icon: <LayoutDashboard size={18} />, to: "/dashboard" },
  { key: "clients", label: "Clientes", icon: <Users size={18} />, to: "/clientes", adminOnly: true },
  { key: "integrations", label: "Integrações", icon: <Link2 size={18} />, to: "/integracoes", adminOnly: true },
  { key: "settings", label: "Configurações", icon: <Settings size={18} />, to: "/dashboard", view: "settings", adminOnly: true },
];

/**
 * The one sidebar of the platform. Pages inside the classic dashboard pass `onSelect` to switch
 * views in place; every other page navigates (dashboard views open through ?view=).
 */
export function AgencySidebar({
  active,
  isAdmin = true,
  open,
  onClose,
  onSelect,
  user,
  onSignOut,
}: {
  active: SideKey;
  isAdmin?: boolean;
  open: boolean;
  onClose: () => void;
  onSelect?: (key: SideKey) => boolean | void;
  user: { name: string; subtitle: string; initials: string };
  onSignOut: () => void;
}) {
  return (
    <aside className={"agSide" + (open ? " open" : "")}>
      <div className="agBrand">
        <img src="/scase-logo-light.svg" alt="SCASE · Branding, design e performance" />
        <button className="agClose" onClick={onClose} aria-label="Fechar menu">
          <X size={18} />
        </button>
      </div>
      <nav className="agNav" aria-label="Menu principal">
        {ITEMS.filter((i) => isAdmin || !i.adminOnly).map((i) => {
          const cls = "agNavItem" + (active === i.key ? " active" : "");
          // Inside the dashboard, its own views switch without a page change.
          if (onSelect && i.to === "/dashboard")
            return (
              <button key={i.key} type="button" className={cls} aria-current={active === i.key ? "page" : undefined} onClick={() => onSelect(i.key)}>
                {i.icon}
                <span>{i.label}</span>
              </button>
            );
          return (
            <Link key={i.key} to={i.to} search={(i.view ? { view: i.view } : {}) as never} className={cls} aria-current={active === i.key ? "page" : undefined} onClick={onClose}>
              {i.icon}
              <span>{i.label}</span>
            </Link>
          );
        })}
      </nav>
      <button className="agUser" onClick={onSignOut} title="Sair da conta">
        <span className="agAvatar">{user.initials}</span>
        <span className="agUserText">
          <strong>{user.name}</strong>
          <small>{user.subtitle}</small>
        </span>
        <LogOut size={17} />
      </button>
    </aside>
  );
}
