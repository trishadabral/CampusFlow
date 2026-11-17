// M1 — Login: split screen. Left = brand + tagline. Right = form + demo buttons.
// Demo accounts (seeded): admin@campusflow.local / priya@techcorp.com / aarav@student.local — password: password123

import React, { useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
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
      {/* Brand panel — just the logo and the tagline. */}
      <div className="hidden lg:flex w-[45%] bg-slate-900 text-white flex-col p-12">
        <div className="flex items-center gap-3">
          <svg className="w-10 h-10" viewBox="0 0 40 40" fill="none">
            <path d="M20 3 L34 11 V29 L20 37 L6 29 V11 Z" fill="#FF5C38" />
            <path d="M13 16.5h10m0 0l-3-3m3 3l-3 3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M13 23.5h10m0 0l-3-3m3 3l-3 3" stroke="#67E8F9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="font-display font-bold text-[22px] leading-[0.95] tracking-wide text-white">CAMPUS<br />FLOW</div>
        </div>
        <div className="flex-1 flex items-center">
          <p className="text-lg text-slate-400">Placement, scheduled.</p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <h1 className="font-display text-2xl font-bold text-slate-100">Welcome back</h1>
          <p className="text-sm text-slate-400 mt-1 mb-8">Sign in to your placement portal.</p>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@college.edu"
                className="w-full rounded-xl border border-white/10 bg-[#12172A] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
              />
            </div>
            <div>
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
              <Link to="/forgot-password" className="text-xs font-medium text-[#FF5C38] hover:text-[#FF8A6B]">
                Forgot password?
              </Link>
            </div>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-white/10 bg-[#12172A] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
              />
            </div>
            <button
              type="submit" disabled={busy}
              className="w-full bg-[#FF5C38] hover:bg-[#E8492B] disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors"
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="text-sm text-slate-400 mt-6 text-center">
            New here?{' '}
            <Link to="/register" className="font-semibold text-[#FF5C38] hover:text-[#FF8A6B]">Create an account</Link>
          </p>

          <div className="mt-8">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Try a demo account</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {DEMOS.map((d) => (
                <button
                  key={d.role} disabled={busy}
                  onClick={(e) => submit(e, d)}
                  className="border border-white/10 bg-[#12172A] hover:border-[#FF5C38]/40 hover:bg-[#FF5C38]/10 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors disabled:opacity-60"
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
