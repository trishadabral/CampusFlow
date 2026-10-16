// M1 — App shell: dark sidebar (role-filtered nav) + topbar + <Outlet/>.

import React from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import Badge from './Badge.jsx';

// Nav per role — every link must exist, no dead buttons.
const NAV = {
  student: [
    { to: '/student', label: 'Dashboard', end: true },
    { to: '/student/drives', label: 'Drives' },
    { to: '/student/bookings', label: 'My Bookings' },
  ],
  recruiter: [
    { to: '/recruiter', label: 'Dashboard', end: true },
    { to: '/recruiter/drives', label: 'My Drives' },
  ],
  admin: [
    { to: '/admin', label: 'Dashboard', end: true },
    { to: '/admin/monitor', label: 'Kernel Monitor' },
    { to: '/admin/scheduling', label: 'Scheduling Lab' },
    { to: '/admin/resources', label: 'Resources' },
    { to: '/admin/reports', label: 'Reports' },
    { to: '/admin/users', label: 'Users' },
  ],
};

const TITLES = {
  '/student': 'Dashboard', '/student/drives': 'Placement Drives', '/student/bookings': 'My Bookings',
  '/recruiter': 'Dashboard', '/recruiter/drives': 'My Drives',
  '/admin': 'Dashboard', '/admin/monitor': 'Kernel Monitor', '/admin/scheduling': 'Scheduling Lab',
  '/admin/resources': 'Resources', '/admin/reports': 'Reports', '/admin/users': 'Users',
};

function LogoMark() {
  // Hexagon + flow lines — the CampusFlow mark.
  return (
    <svg className="w-9 h-9" viewBox="0 0 40 40" fill="none">
      <path d="M20 3 L34 11 V29 L20 37 L6 29 V11 Z" fill="#4f46e5" />
      <path d="M13 16.5h10m0 0l-3-3m3 3l-3 3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 23.5h10m0 0l-3-3m3 3l-3 3" stroke="#a5b4fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const role = user?.role ?? 'student';
  const items = NAV[role] ?? NAV.student;

  // Match the deepest known title (handles /student/drives/12 etc.)
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
      <aside className="w-60 shrink-0 bg-slate-900 text-white flex flex-col fixed inset-y-0 left-0">
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
                `block px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              {it.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-5 py-5 border-t border-slate-800">
          <div className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">OS kernel v1 · Phase 1</div>
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
            <div className="flex items-center gap-4">
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
