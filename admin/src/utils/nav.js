import {
  BarChart3,
  Building2,
  CalendarClock,
  ClipboardList,
  Film,
  LayoutDashboard,
  QrCode,
  Receipt,
  Settings,
  Ticket,
  Users,
  Wallet,
} from 'lucide-react';
import { ROLES } from '../context/AuthContext.jsx';

const BOTH = [ROLES.SUPER_ADMIN, ROLES.SHOW_RUNNER];
const ADMIN_ONLY = [ROLES.SUPER_ADMIN];

/**
 * The console's navigation.
 *
 * `roles` mirrors which API namespace actually serves the page, so the menu
 * cannot offer a super-admin-only section to a show runner. That is a
 * convenience, not a security boundary — the endpoint behind each page
 * re-checks the caller's role, account status, profile status and venue
 * assignment on every request.
 *
 * `ready` is false for sections whose pages are not built yet. Those are left
 * out of the menu entirely rather than shown as dead links, so nothing in the
 * sidebar leads somewhere that does not work.
 */
export const NAV_SECTIONS = [
  {
    label: null,
    items: [
      {
        to: '/',
        label: 'Dashboard',
        icon: LayoutDashboard,
        roles: BOTH,
        ready: true,
        end: true,
      },
    ],
  },
  {
    label: 'Catalogue',
    items: [
      { to: '/movies', label: 'Movies', icon: Film, roles: ADMIN_ONLY, ready: true },
      { to: '/theaters', label: 'Theaters', icon: Building2, roles: BOTH, ready: true },
      { to: '/shows', label: 'Shows', icon: CalendarClock, roles: BOTH, ready: true },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/bookings', label: 'Bookings', icon: Ticket, roles: BOTH, ready: false },
      { to: '/finance', label: 'Finance', icon: Wallet, roles: BOTH, ready: false },
      { to: '/refunds', label: 'Refunds', icon: Receipt, roles: BOTH, ready: false },
      { to: '/gate', label: 'Gate scanner', icon: QrCode, roles: BOTH, ready: false },
    ],
  },
  {
    label: 'Platform',
    items: [
      {
        to: '/applications',
        label: 'Applications',
        icon: ClipboardList,
        roles: ADMIN_ONLY,
        ready: false,
      },
      { to: '/show-runners', label: 'Show runners', icon: Users, roles: ADMIN_ONLY, ready: false },
      { to: '/users', label: 'Accounts', icon: Users, roles: ADMIN_ONLY, ready: false },
      { to: '/audit', label: 'Audit log', icon: BarChart3, roles: ADMIN_ONLY, ready: false },
      { to: '/settings', label: 'Settings', icon: Settings, roles: ADMIN_ONLY, ready: false },
    ],
  },
];

/** The sections and items this role may see, with empty sections dropped. */
export function navigationFor(role) {
  if (!role) return [];
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.ready && item.roles.includes(role)),
  })).filter((section) => section.items.length > 0);
}
