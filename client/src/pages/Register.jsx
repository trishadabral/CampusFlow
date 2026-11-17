// Register — create a student account and go straight to your portal.
// Public sign-up is student-only: staff accounts are created by an
// admin from the Users page. The server creates the student profile
// and returns a token, so a new account signs in immediately.

import React, { useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { errMsg } from '../api.js';

const HOME = { admin: '/admin', recruiter: '/recruiter', student: '/student' };

const inputCls = 'w-full rounded-xl border border-white/10 bg-[#12172A] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400';
const labelCls = 'block text-sm font-medium text-slate-300 mb-1.5';

export default function Register() {
  const { user, register, ready } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rollNo, setRollNo] = useState('');
  const [branch, setBranch] = useState('');
  const [cgpa, setCgpa] = useState('');
  const [backlogs, setBacklogs] = useState('0');
  const [gradYear, setGradYear] = useState(String(new Date().getFullYear() + 1));
  const [busy, setBusy] = useState(false);

  if (ready && user) return <Navigate to={HOME[user.role] ?? '/student'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !email || !password) {
      toast('Please fill in your name, email and password.', 'error');
      return;
    }
    if (!rollNo.trim() || !branch.trim() || cgpa === '' || !gradYear) {
      toast('Students also need a roll number, branch, CGPA and graduating year.', 'error');
      return;
    }
    setBusy(true);
    try {
      const u = await register({
        name: name.trim(),
        email,
        password,
        roll_no: rollNo.trim(),
        branch: branch.trim(),
        cgpa: Number(cgpa),
        backlogs: Number(backlogs) || 0,
        graduation_year: Number(gradYear),
      });
      toast(`Welcome, ${u.name}! Your account is ready.`, 'success');
      navigate(HOME[u.role] ?? '/student', { replace: true });
    } catch (err) {
      toast(errMsg(err, 'Could not create your account. Please try again.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        <h1 className="font-display text-2xl font-bold text-slate-100">Create your student account</h1>
        <p className="text-sm text-slate-400 mt-1 mb-8">One account for the whole placement journey. Recruiters and admins get their accounts from the placement office.</p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className={labelCls}>Full name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aarav Sharma" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@college.edu" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" className={inputCls} />
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0B0E1A] p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Roll number</label>
                  <input value={rollNo} onChange={(e) => setRollNo(e.target.value)} placeholder="e.g. 61" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Branch</label>
                  <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="e.g. CSE" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>CGPA</label>
                  <input type="number" min="0" max="10" step="0.01" value={cgpa} onChange={(e) => setCgpa(e.target.value)} placeholder="e.g. 8.2" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Backlogs</label>
                  <input type="number" min="0" value={backlogs} onChange={(e) => setBacklogs(e.target.value)} className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Graduating year</label>
                <input type="number" min="2000" max="2100" value={gradYear} onChange={(e) => setGradYear(e.target.value)} className={inputCls} />
              </div>
            </div>

          <button
            type="submit" disabled={busy}
            className="w-full bg-[#FF5C38] hover:bg-[#E8492B] disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors"
          >
            {busy ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="text-sm text-slate-400 mt-6 text-center">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-[#FF5C38] hover:text-[#FF8A6B]">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
