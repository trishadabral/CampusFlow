// Forgot password — ask for a reset link by email.
// The server always replies with the same message, so this page never
// reveals whether an email address has an account.

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { auth as authApi, errMsg } from '../api.js';
import { useToast } from '../components/Toast.jsx';

export default function ForgotPassword() {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!email) {
      toast('Please enter your email address.', 'error');
      return;
    }
    setBusy(true);
    try {
      const { data } = await authApi.forgotPassword(email);
      setSent(true);
      toast(data.message || 'If an account exists for that email, a reset link has been sent.', 'success');
    } catch (err) {
      toast(errMsg(err, 'Could not send the reset link. Please try again.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-slate-900">Forgot your password?</h1>
        <p className="text-sm text-slate-500 mt-1 mb-8">
          Enter the email you signed up with and we’ll send you a link to choose a new password.
        </p>

        {sent ? (
          <div className="cf-card">
            <div className="text-3xl mb-2">✉️</div>
            <p className="font-semibold text-slate-900">Check your inbox</p>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">
              If an account exists for <span className="font-medium text-slate-700">{email}</span>, a
              reset link is on its way. The link works for 1 hour and can only be used once.
              Didn’t get it? Check your spam folder, or try again.
            </p>
            <Link to="/login" className="cf-btn-primary inline-block mt-5">Back to sign in</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@college.edu"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <button
              type="submit" disabled={busy}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors"
            >
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}

        <Link to="/login" className="block text-sm font-medium text-indigo-600 hover:text-indigo-800 mt-6">
          ← Back to sign in
        </Link>
      </div>
    </div>
  );
}
