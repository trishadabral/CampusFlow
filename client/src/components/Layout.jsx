// App shell: dark sidebar (role-filtered nav) + topbar with notification
// bell + <Outlet/>. Every link must exist — no dead buttons.

import React from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import Badge from './Badge.jsx';
import NotificationsBell from './NotificationsBell.jsx';

const NAV = {
  student: [
    { to: '/student', label: 'Dashboard', end: true },
    { to: '/student/drives', label: 'Find Drives' },
    { to: '/student/bookings', label: 'My Schedule' },
  ],
  recruiter: [
    { to: '/recruiter', label: 'Dashboard', end: true },
    { to: '/recruiter/drives', label: 'My Drives' },
    { to: '/recruiter/drives/new', label: '+ New Drive', highlight: true },
  ],
  admin: [
    { to: '/admin', label: 'Control Center', end: true },
    { to: '/admin/monitor', label: 'Kernel Monitor' },
    { to: '/admin/scheduling', label: 'Scheduling Lab' },
    { to: '/admin/resources', label: 'Resources' },
    { to: '/admin/reports', label: 'Reports' },
    { to: '/admin/users', label: 'Users' },
  ],
};

const TITLES = {
  '/student': 'My Journey', '/student/drives': 'Find Drives', '/student/bookings': 'My Schedule',
  '/recruiter': 'Dashboard', '/recruiter/drives': 'My Drives', '/recruiter/drives/new': 'New Drive',
  '/admin': 'Control Center', '/admin/monitor': 'Kernel Monitor', '/admin/scheduling': 'Scheduling Lab',
  '/admin/resources': 'Resources', '/admin/reports': 'Reports', '/admin/users': 'Users',
};

function LogoMark() {
  return (
    <svg className="w-9 h-9" viewBox="0 0 40 40" fill="none">
      <path d="M20 3 L34 11 V29 L20 37 L6 29 V11 Z" fill="url(#cf-logo-grad)" />
      <path d="M13 16.5h10m0 0l-3-3m3 3l-3 3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 23.5h10m0 0l-3-3m3 3l-3 3" stroke="#c7d2fe" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <defs>
        <linearGradient id="cf-logo-grad" x1="6" y1="3" x2="34" y2="37">
          <stop stopColor="#4f46e5" /><stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const role = user?.role ?? 'student';
  const items = NAV[role] ?? NAV.student;

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

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 text-white flex flex-col fixed inset-y-0 left-0 z-20"
        style={{ background: 'linear-gradient(180deg,#0f172a 0%,#1e1b4b 100%)' }}>
        <div className="flex items-center gap-3 px-5 py-6">
          <LogoMark />
          <div>
            <div className="font-bold text-[15px] leading-tight">CampusFlow OS</div>
            <div className="text-[11px] text-slate-400">Placement, scheduled.</div>
          </div>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              className={({ isActive }) =>
                `block px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  it.highlight
                    ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-900/40 hover:shadow-indigo-900/60 hover:-translate-y-px'
                    : isActive
                      ? 'bg-white/10 text-white shadow-inner'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              {it.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-5 py-5 border-t border-white/10">
          <div className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">OS kernel v2 · Phase 1</div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 cf-live-dot" />
            All systems nominal
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 ml-60 flex flex-col min-h-screen">
        <header className="sticky top-0 z-10 bg-[#f3f5fa]/90 backdrop-blur border-b border-slate-200/60">
          <div className="flex items-center justify-between px-8 py-4">
            <h1 className="text-xl font-bold text-slate-900">{title}</h1>
            <div className="flex items-center gap-3">
              <NotificationsBell />
              <Badge variant={role === 'admin' ? 'danger' : role === 'recruiter' ? 'info' : 'success'}>
                {role.charAt(0).toUpperCase() + role.slice(1)}
              </Badge>
              <span className="text-sm font-medium text-slate-700">{user?.name}</span>
              <button
                onClick={onLogout}
                className="text-sm font-medium text-slate-500 hover:text-rose-600 border border-slate-200 hover:border-rose-200 bg-white rounded-xl px-4 py-2 transition-colors"
              >
                Log out
              </button>
            </div>
          </div>
        </header>
        <main className="flex-1 px-8 py-6 max-w-7xl w-full">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
