// M1 — Login: split screen. Left = brand + 3 value props. Right = form + demo buttons.
// Demo accounts (seeded): admin@campusflow.local / priya@techcorp.com / aarav@student.local — password: password123

import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { errMsg } from '../api.js';

const DEMOS = [
  { role: 'Admin', email: 'admin@campusflow.local' },
  { role: 'Recruiter', email: 'priya@techcorp.com' },
  { role: 'Student', email: 'aarav@student.local' },
];
const DEMO_PASSWORD = 'password123';

const HOME = { admin: '/admin', recruiter: '/recruiter', student: '/student' };

export default function Login() {
  const { user, login, ready } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  if (ready && user) return <Navigate to={HOME[user.role] ?? '/student'} replace />;

  const submit = async (e, prefill) => {
    e?.preventDefault();
    const em = prefill?.email ?? email;
    const pw = prefill ? DEMO_PASSWORD : password;
    if (!em || !pw) {
      toast('Please enter your email and password.', 'error');
      return;
    }
    setBusy(true);
    try {
      const u = await login(em, pw);
      navigate(HOME[u.role] ?? '/student', { replace: true });
    } catch (err) {
      toast(errMsg(err, 'Login failed. Check your email and password.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Brand panel */}
      <div className="hidden lg:flex w-[45%] bg-slate-900 text-white flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <svg className="w-10 h-10" viewBox="0 0 40 40" fill="none">
            <path d="M20 3 L34 11 V29 L20 37 L6 29 V11 Z" fill="#4f46e5" />
            <path d="M13 16.5h10m0 0l-3-3m3 3l-3 3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M13 23.5h10m0 0l-3-3m3 3l-3 3" stroke="#a5b4fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="text-xl font-bold">CampusFlow OS</div>
        </div>
        <div>
          <h2 className="text-3xl font-bold leading-tight mb-8">
            The operating system<br />for campus placements.
          </h2>
          <ul className="space-y-5">
            {[
              ['One-click eligibility', 'Recruiters set criteria once — a stored procedure builds the shortlist, with a reason for every student.'],
              ['Conflict-free booking', 'Interview slots serialize on real database locks. Run 100 students at 10 seats — exactly 10 win.'],
              ['A kernel you can watch', 'Live lock table, process queues and transaction log. Every OS concept, demoable, not claimed.'],
            ].map(([t, d]) => (
              <li key={t} className="flex gap-4">
                <span className="mt-1 w-6 h-6 rounded-full bg-indigo-600/30 flex items-center justify-center shrink-0">
                  <svg className="w-3.5 h-3.5 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <div>
                  <div className="font-semibold">{t}</div>
                  <div className="text-sm text-slate-400 mt-0.5">{d}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="text-xs text-slate-500">PBL Project · OS + DBMS · Phase 1</div>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
          <p className="text-sm text-slate-500 mt-1 mb-8">Sign in to your placement portal.</p>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@college.edu"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <button
              type="submit" disabled={busy}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors"
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="mt-8">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Try a demo account</div>
            <div className="grid grid-cols-3 gap-2">
              {DEMOS.map((d) => (
                <button
                  key={d.role} disabled={busy}
                  onClick={(e) => submit(e, d)}
                  className="border border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors disabled:opacity-60"
                >
                  {d.role}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-3">
              Demo logins: <span className="font-mono-tight">admin@campusflow.local</span>,{' '}
              <span className="font-mono-tight">priya@techcorp.com</span>,{' '}
              <span className="font-mono-tight">aarav@student.local</span> — all with password{' '}
              <span className="font-mono-tight">password123</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
