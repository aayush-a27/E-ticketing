import { NavLink } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { navigationFor } from '../../utils/nav.js';

function Brand({ collapsed }) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-2.5 px-4">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-on-dark/15">
        <svg viewBox="0 0 32 32" className="size-4.5" aria-hidden="true">
          <path
            d="M16 6l7 2.6v6.2c0 4.4-2.9 8.2-7 9.6-4.1-1.4-7-5.2-7-9.6V8.6L16 6z"
            fill="currentColor"
            className="text-brand-on-dark"
          />
        </svg>
      </span>
      {!collapsed && (
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">CineReserve</p>
          <p className="truncate text-[11px] text-ink-400">Operations console</p>
        </div>
      )}
    </div>
  );
}

function NavItem({ item, collapsed, onNavigate }) {
  const { icon: Icon, label, to, end } = item;

  return (
    <li>
      <NavLink
        to={to}
        end={end}
        onClick={onNavigate}
        title={collapsed ? label : undefined}
        className={({ isActive }) =>
          [
            'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
            collapsed ? 'justify-center' : '',
            isActive
              ? 'bg-white/10 font-medium text-white'
              : 'text-ink-300 hover:bg-white/5 hover:text-white',
          ].join(' ')
        }
      >
        {({ isActive }) => (
          <>
            {/* The active rail: the one place amber appears in the navigation. */}
            <span
              className={`absolute left-0 h-5 w-0.5 rounded-r bg-brand-on-dark transition-opacity ${
                isActive ? 'opacity-100' : 'opacity-0'
              }`}
              aria-hidden="true"
            />
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {!collapsed && <span className="truncate">{label}</span>}
          </>
        )}
      </NavLink>
    </li>
  );
}

function NavTree({ collapsed, onNavigate }) {
  const { role } = useAuth();
  const sections = navigationFor(role);

  return (
    <nav className="scroll-quiet flex-1 overflow-y-auto px-2 pb-4" aria-label="Console sections">
      {sections.map((section, index) => (
        <div key={section.label ?? `section-${index}`} className={index > 0 ? 'mt-5' : ''}>
          {section.label && !collapsed && (
            <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
              {section.label}
            </p>
          )}
          {section.label && collapsed && <div className="mx-2.5 mb-1.5 h-px bg-white/10" />}
          <ul className="space-y-0.5">
            {section.items.map((item) => (
              <NavItem
                key={item.to}
                item={item}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * The desktop rail. Collapsing keeps the icons and drops the labels, which is
 * what someone with a show-schedule table open all day actually wants.
 */
export function Sidebar({ collapsed, onToggleCollapsed }) {
  return (
    <aside
      className="hidden shrink-0 flex-col bg-ink-900 transition-[width] duration-200 lg:flex"
      style={{ width: collapsed ? '4.25rem' : '15rem' }}
    >
      <Brand collapsed={collapsed} />
      <NavTree collapsed={collapsed} />
      <div className="shrink-0 border-t border-white/10 p-2">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink-400 transition-colors hover:bg-white/5 hover:text-white ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="size-4" aria-hidden="true" />
          )}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}

/** The same navigation as a drawer, for tablet and phone widths. */
export function MobileSidebar({ open, onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-ink-950/50" onClick={onClose} aria-hidden="true" />
      <div
        className="relative flex h-full w-[16rem] max-w-[82vw] flex-col bg-ink-900 shadow-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Console navigation"
      >
        <div className="flex items-center justify-between pr-2">
          <Brand collapsed={false} />
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-ink-400 transition-colors hover:bg-white/5 hover:text-white"
            aria-label="Close navigation"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <NavTree collapsed={false} onNavigate={onClose} />
      </div>
    </div>
  );
}
