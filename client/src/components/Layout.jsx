// App shell: dark sidebar (role-filtered nav) + topbar with notification
// bell + <Outlet/>. Every link must exist — no dead buttons.

import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { connectLive } from '../realtime.js';
import Badge from './Badge.jsx';
import NotificationsBell from './NotificationsBell.jsx';

const NAV = {
  student: [
    { to: '/student', label: 'Dashboard', end: true },
    { to: '/student/drives', label: 'Find Drives' },
    { to: '/student/bookings', label: 'My Schedule' },
    { to: '/student/profile', label: 'My Profile' },
  ],
  recruiter: [
    { to: '/recruiter', label: 'Dashboard', end: true },
    { to: '/recruiter/drives', label: 'My Drives' },
    { to: '/recruiter/drives/new', label: 'Add Drive', highlight: true },
  ],
  admin: [
    { to: '/admin', label: 'Control Center', end: true },
    { to: '/admin/monitor', label: 'Live Monitor' },
    { to: '/admin/resources', label: 'Resources' },
    { to: '/admin/reports', label: 'Reports' },
    { to: '/admin/users', label: 'Users' },
  ],
};

const TITLES = {
  '/student': 'My Applications', '/student/drives': 'Find Drives', '/student/bookings': 'My Schedule', '/student/profile': 'My Profile',
  '/recruiter': 'Dashboard', '/recruiter/drives': 'My Drives', '/recruiter/drives/new': 'Add Drive',
  '/admin': 'Control Center', '/admin/monitor': 'Live Monitor', '/admin/scheduling': 'Interview Scheduler',
  '/admin/resources': 'Resources', '/admin/calendar': 'Room calendar', '/admin/audit': 'Activity log', '/admin/reports': 'Reports', '/admin/users': 'Users',
};

function LogoMark() {
  return (
    <svg className="w-9 h-9" viewBox="0 0 40 40" fill="none">
      <path d="M20 3 L34 11 V29 L20 37 L6 29 V11 Z" fill="#FF5C38" />
      <path d="M13 16.5h10m0 0l-3-3m3 3l-3 3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 23.5h10m0 0l-3-3m3 3l-3 3" stroke="#22D3EE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const role = user?.role ?? 'student';
  const items = NAV[role] ?? NAV.student;
  // Small screens: the sidebar hides and opens as an overlay drawer.
  // Desktop (md and up) keeps the fixed sidebar exactly as before.
  const [navOpen, setNavOpen] = useState(false);

  // Close the drawer whenever the page changes.
  useEffect(() => { setNavOpen(false); }, [location.pathname]);

  const title =
    TITLES[location.pathname] ??
    Object.entries(TITLES)
      .filter(([p]) => location.pathname.startsWith(p))
      .sort((a, b) => b[0].length - a[0].length)[0]?.[1] ??
    'CampusFlow OS';

  const onLogout = () => {
    logout();
    navigate('/login');
  };

  // Live updates: one shared connection for every logged-in page. Each
  // event is re-broadcast as a window event so the bell and the current
  // page can refresh right away; polling stays as the fallback.
  useEffect(() => {
    const live = connectLive(({ type, data }) => {
      window.dispatchEvent(new CustomEvent('campusflow-live', { detail: { type, data } }));
    });
    return () => live?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex">
      {/* Tap outside the drawer to close it (small screens only). */}
      {navOpen && (
        <div className="fixed inset-0 bg-black/60 z-20 md:hidden" onClick={() => setNavOpen(false)} aria-hidden="true" />
      )}
      {/* Sidebar — overlay drawer below md, fixed sidebar at md and up. */}
      <aside className={`cf-app-sidebar w-60 shrink-0 text-white flex flex-col fixed inset-y-0 left-0 z-30 md:z-20 transition-transform duration-200 md:translate-x-0 ${navOpen ? 'translate-x-0' : '-translate-x-full'} bg-[#12172A] border-r border-white/10`}>
        <div className="flex items-center gap-3 px-5 py-6">
          <LogoMark />
          <div>
            <div className="font-display font-bold text-[22px] leading-[0.95] tracking-wide text-white">CAMPUS<br />FLOW</div>
            <div className="text-[11px] text-slate-400 mt-1">Placement, scheduled.</div>
          </div>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              onClick={() => setNavOpen(false)}
              className={({ isActive }) =>
                `block px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  it.highlight
                    ? 'bg-[#FF5C38] text-white shadow-lg shadow-[#FF5C38]/25 hover:bg-[#E8492B] hover:-translate-y-px'
                    : isActive
                      ? 'bg-white/10 text-white shadow-[inset_3px_0_0_0_#22D3EE]'
                      : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              {it.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-5 py-5 border-t border-white/10">
          <div className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">CampusFlow v2</div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 cf-live-dot" />
            All systems nominal
          </div>
        </div>
      </aside>

      {/* Main column — full width below md, offset by the sidebar at md and up. */}
      <div className="flex-1 ml-0 md:ml-60 flex flex-col min-h-screen">
        <header className="cf-app-topbar sticky top-0 z-10 bg-[#0B0E1A]/90 backdrop-blur border-b border-white/10">
          <div className="flex items-center justify-between px-4 md:px-8 py-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setNavOpen(true)}
                aria-label="Open menu"
                className="md:hidden shrink-0 text-slate-400 hover:text-white border border-white/10 bg-[#12172A] rounded-xl p-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </button>
              <h1 className="text-xl font-display font-bold tracking-wide text-slate-100 truncate">{title}</h1>
            </div>
            <div className="flex items-center gap-3">
              <NotificationsBell />
              <Badge variant={role === 'admin' ? 'danger' : role === 'recruiter' ? 'info' : 'success'}>
                {role.charAt(0).toUpperCase() + role.slice(1)}
              </Badge>
              <span className="hidden sm:inline text-sm font-medium text-slate-300">{user?.name}</span>
              <button
                onClick={onLogout}
                className="text-sm font-medium text-slate-400 hover:text-rose-400 border border-white/10 hover:border-rose-500/40 bg-[#12172A] rounded-xl px-4 py-2 transition-colors"
              >
                Log out
              </button>
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 md:px-8 py-6 max-w-7xl w-full">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
