// Reset password — reached from the link in the reset email (?token=...).
// No login needed here: the token in the link is the proof. After saving,
// the student signs in again with the new password.

import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { auth as authApi, errMsg } from '../api.js';
import { useToast } from '../components/Toast.jsx';

export default function ResetPassword() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 8) {
      toast('Your new password must be at least 8 characters long.', 'error');
      return;
    }
    if (password !== confirm) {
      toast('The two passwords don’t match. Please type them again.', 'error');
      return;
    }
    setBusy(true);
    try {
      const { data } = await authApi.resetPassword(token, password);
      toast(data.message || 'Your password has been changed.', 'success');
      navigate('/login', { replace: true });
    } catch (err) {
      toast(errMsg(err, 'Could not change your password. The link may have expired.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <h1 className="font-display text-2xl font-bold text-slate-100">This link isn’t complete</h1>
          <p className="text-sm text-slate-400 mt-2 leading-relaxed">
            The reset link is missing its code. Please use the full link from your email,
            or request a new one.
          </p>
          <Link to="/forgot-password" className="cf-btn-primary inline-block mt-5">Request a new link</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        <h1 className="font-display text-2xl font-bold text-slate-100">Choose a new password</h1>
        <p className="text-sm text-slate-400 mt-1 mb-8">
          At least 8 characters. This link works once — after you save, it stops working.
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">New password</label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full rounded-xl border border-white/10 bg-[#12172A] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Type it again</label>
            <input
              type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat your new password"
              className="w-full rounded-xl border border-white/10 bg-[#12172A] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
            />
          </div>
          <button
            type="submit" disabled={busy}
            className="w-full bg-[#FF5C38] hover:bg-[#E8492B] disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors"
          >
            {busy ? 'Saving…' : 'Save new password'}
          </button>
        </form>

        <Link to="/login" className="block text-sm font-medium text-[#FF5C38] hover:text-[#FF8A6B] mt-6">
          ← Back to sign in
        </Link>
      </div>
    </div>
  );
}
