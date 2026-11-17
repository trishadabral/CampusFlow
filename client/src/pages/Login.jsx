// Login — the app's front page: very dark navy, a campus photo along
// the bottom-left, thin cyan/purple corner arcs, huge "Campus Flow"
// headline on the left, sign-in card on the right.
// Demo accounts (seeded): admin@campusflow.local / priya@techcorp.com /
// aarav@student.local — password: password123. The photo is a remote
// Unsplash URL on purpose: no binary file may go into the repo (the
// GitHub snapshot push cannot carry binaries).

import React, { useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { errMsg } from '../api.js';

// Dark campus building, layered under a heavy navy overlay in the page.
const CAMPUS_PHOTO =
  'https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&w=1600&q=80';

const DEMOS = [
  { role: 'Admin', email: 'admin@campusflow.local', icon: 'shield' },
  { role: 'Recruiter', email: 'priya@techcorp.com', icon: 'briefcase' },
  { role: 'Student', email: 'aarav@student.local', icon: 'cap' },
];
const DEMO_PASSWORD = 'password123';

const HOME = { admin: '/admin', recruiter: '/recruiter', student: '/student' };

function Icon({ name, className }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className,
    'aria-hidden': true,
  };
  if (name === 'mail')
    return (
      <svg {...common}>
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m22 7-10 6L2 7" />
      </svg>
    );
  if (name === 'lock')
    return (
      <svg {...common}>
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    );
  if (name === 'eye')
    return (
      <svg {...common}>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  if (name === 'eye-off')
    return (
      <svg {...common}>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    );
  if (name === 'shield')
    return (
      <svg {...common}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    );
  if (name === 'briefcase')
    return (
      <svg {...common}>
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </svg>
    );
  if (name === 'cap')
    return (
      <svg {...common}>
        <path d="M22 10 12 5 2 10l10 5 10-5z" />
        <path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" />
      </svg>
    );
  return null;
}

export default function Login() {
  const { user, login, ready } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="min-h-screen relative bg-[#0B0E1A] overflow-hidden">
      {/* Background: campus photo along the bottom-left, fading into the
          navy toward the top and right, plus thin corner arcs. */}
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        <div
          className="absolute bottom-0 left-0 w-[62%] h-[58%] bg-cover bg-center"
          style={{
            backgroundImage: `url(${CAMPUS_PHOTO})`,
            filter: 'brightness(0.42) saturate(0.85)',
          }}
        />
        <div className="absolute bottom-0 left-0 w-[62%] h-[58%] bg-gradient-to-t from-[#0B0E1A] via-[#0B0E1A]/20 to-transparent" />
        <div className="absolute bottom-0 left-0 w-[62%] h-[58%] bg-gradient-to-r from-transparent via-[#0B0E1A]/25 to-[#0B0E1A]" />
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full border border-cyan-400/25" />
        <div className="absolute -top-20 -left-20 w-72 h-72 rounded-full border border-cyan-400/15" />
        <div className="absolute -bottom-44 -right-44 w-[30rem] h-[30rem] rounded-full border border-purple-500/25" />
        <div className="absolute -bottom-32 -right-32 w-80 h-80 rounded-full border border-purple-500/15" />
      </div>

      <div className="relative z-10 min-h-screen flex">
        {/* Brand panel — logo, headline, tagline. */}
        <div className="hidden lg:flex w-[45%] text-white flex-col p-12">
          <div className="flex items-center gap-3">
            <svg className="w-10 h-10" viewBox="0 0 40 40" fill="none">
              <path d="M20 3 L34 11 V29 L20 37 L6 29 V11 Z" fill="#FF5C38" />
              <path d="M13 16.5h10m0 0l-3-3m3 3l-3 3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M13 23.5h10m0 0l-3-3m3 3l-3 3" stroke="#67E8F9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="font-display font-bold text-[22px] leading-[0.95] tracking-wide text-white">CAMPUS<br />FLOW</div>
          </div>

          <div className="flex-1 flex flex-col justify-center">
            <div className="border-t border-white/15 w-24" />
            <h1 className="mt-8 font-sans font-extrabold tracking-tight leading-[1.05] text-[64px] text-white">
              Campus <span className="text-[#22D3EE]">Flow</span>
            </h1>
            <p className="mt-4 text-xl font-medium text-slate-400">
              Connect <span className="text-[#22D3EE]">•</span> Recruit <span className="text-[#22D3EE]">•</span> Grow
            </p>
            <p className="mt-6 text-lg text-slate-300">Placement, scheduled.</p>
            <div className="mt-6 h-[3px] w-28 rounded-full bg-gradient-to-r from-cyan-400 to-purple-500" />
          </div>
        </div>

        {/* Sign-in card */}
        <div className="flex-1 flex items-center justify-center p-6 sm:p-8">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#12172A]/95 p-8 shadow-2xl">
            <h2 className="font-sans text-[28px] font-bold text-white">Welcome back</h2>
            <p className="text-sm text-slate-400 mt-1 mb-8">Sign in to your placement portal.</p>

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-200 mb-1.5">
                  <Icon name="mail" className="w-4 h-4 text-slate-300" /> Email
                </label>
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@college.edu"
                  className="w-full rounded-xl border border-white/10 bg-[#0B0E1A] px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-200">
                    <Icon name="lock" className="w-4 h-4 text-slate-300" /> Password
                  </label>
                  <Link to="/forgot-password" className="text-xs font-medium text-[#22D3EE] hover:text-cyan-300">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'} value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full rounded-xl border border-white/10 bg-[#0B0E1A] px-4 py-2.5 pr-11 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
                  />
                  <button
                    type="button" tabIndex={-1}
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                  >
                    <Icon name={showPassword ? 'eye' : 'eye-off'} className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <button
                type="submit" disabled={busy}
                className="w-full rounded-full bg-gradient-to-r from-cyan-400 to-cyan-500 hover:from-cyan-300 hover:to-cyan-400 disabled:opacity-60 text-[#0B0E1A] font-semibold py-3 text-sm transition-all shadow-lg shadow-cyan-500/20"
              >
                {busy ? 'Signing in…' : 'Sign In →'}
              </button>
            </form>

            <div className="mt-7 flex items-center gap-3">
              <div className="flex-1 border-t border-white/10" />
              <p className="text-sm text-slate-400">
                New here?{' '}
                <Link to="/register" className="font-semibold text-[#22D3EE] hover:text-cyan-300">Create an account</Link>
              </p>
              <div className="flex-1 border-t border-white/10" />
            </div>

            <div className="mt-7">
              <div className="text-sm text-slate-400 mb-3">Try a demo account</div>
              <div className="grid grid-cols-3 gap-2">
                {DEMOS.map((d) => (
                  <button
                    key={d.role} disabled={busy}
                    onClick={(e) => submit(e, d)}
                    className="border border-white/10 bg-[#0B0E1A] hover:border-cyan-400/50 hover:bg-cyan-400/10 rounded-full px-3 py-2.5 text-sm font-medium text-slate-200 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    <Icon name={d.icon} className="w-4 h-4" />
                    {d.role}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-4 text-center">
                Demo logins: <span className="font-mono-tight">admin@campusflow.local</span>,{' '}
                <span className="font-mono-tight">priya@techcorp.com</span>,{' '}
                <span className="font-mono-tight">aarav@student.local</span> — all with password{' '}
                <span className="font-mono-tight">password123</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
