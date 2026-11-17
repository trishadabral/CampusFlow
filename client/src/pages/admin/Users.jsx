// M1 — Users: admin directory of accounts (privilege rings: admin > recruiter > student).
// Admins can create recruiter/admin accounts here (public sign-up is
// student-only), deactivate accounts, and reset a password.

import React, { useEffect, useState } from 'react';
import { users as usersApi, errMsg } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import DataTable from '../../components/DataTable.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Modal from '../../components/Modal.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';

const ROLE_PILL = { admin: 'danger', recruiter: 'info', student: 'success' };

export default function Users() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [unavailable, setUnavailable] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'recruiter' });
  const [busy, setBusy] = useState(false);
  const [toggleUser, setToggleUser] = useState(null);
  const [tempPassword, setTempPassword] = useState(null);

  const load = async () => {
    try {
      const { data } = await usersApi.list();
      setRows(data ?? []);
    } catch (err) {
      if (err?.response?.status === 404) {
        setUnavailable(true);
      } else {
        toast(errMsg(err, 'Could not load users.'), 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createUser = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await usersApi.create(form);
      toast(`Account created for ${data.user.name}.`, 'success');
      setShowCreate(false);
      setForm({ name: '', email: '', password: '', role: 'recruiter' });
      load();
    } catch (err) {
      toast(errMsg(err, 'Could not create that account.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const confirmToggle = async () => {
    if (!toggleUser) return;
    setBusy(true);
    try {
      await usersApi.setActive(toggleUser.id, !toggleUser.is_active);
      toast(
        toggleUser.is_active
          ? `${toggleUser.name} deactivated — they can no longer sign in.`
          : `${toggleUser.name} reactivated.`,
        'success'
      );
      setToggleUser(null);
      load();
    } catch (err) {
      toast(errMsg(err, 'Could not change that account.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async (u) => {
    setBusy(true);
    try {
      const { data } = await usersApi.resetPassword(u.id);
      // One-time password: shown once, here only — it is not stored anywhere.
      setTempPassword({ name: u.name, password: data.temp_password });
    } catch (err) {
      toast(errMsg(err, 'Could not reset that password.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="text-sm text-slate-400 py-10 text-center">Loading users…</div>;

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  return (
    <div className="space-y-6">
    <div className="bg-[#12172A] rounded-2xl shadow-sm border border-white/10">
      <div className="px-5 py-4 border-b border-white/10 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-100">Users</h2>
          <p className="text-xs text-slate-400 mt-0.5">Role-based access: admins see everything, recruiters manage their drives, students see their own data.</p>
        </div>
        <button type="button" className="cf-btn-primary" onClick={() => setShowCreate(true)}>Add user</button>
      </div>
      {unavailable ? (
        <EmptyState
          title="User directory unavailable"
          message="The backend doesn't expose a user list yet. Accounts are still fully functional through login."
        />
      ) : rows.length === 0 ? (
        <EmptyState title="No users found" message="Registered accounts will appear here." />
      ) : (
        <DataTable
          columns={[
            { key: 'name', label: 'Name', render: (u) => <span className="font-medium text-slate-100">{u.name}</span> },
            { key: 'email', label: 'Email', render: (u) => <span className="text-slate-400">{u.email}</span> },
            { key: 'role', label: 'Role', render: (u) => <Badge variant={ROLE_PILL[u.role] ?? 'neutral'}>{u.role}</Badge> },
            { key: 'branch', label: 'Branch', render: (u) => u.branch ?? '—' },
            { key: 'cgpa', label: 'CGPA', render: (u) => u.cgpa ?? '—' },
            {
              key: 'status', label: 'Status',
              render: (u) => u.is_active === false || u.is_active === 0
                ? <Badge variant="danger">Deactivated</Badge>
                : <Badge variant="success">Active</Badge>,
            },
            {
              key: 'actions', label: '', render: (u) => (
                <div className="flex gap-2">
                  <button type="button" className="cf-btn-secondary !py-1.5" disabled={busy} onClick={() => setToggleUser(u)}>
                    {u.is_active === false || u.is_active === 0 ? 'Reactivate' : 'Deactivate'}
                  </button>
                  <button type="button" className="cf-btn-secondary !py-1.5" disabled={busy} onClick={() => resetPassword(u)}>
                    Reset password
                  </button>
                </div>
              ),
            },
          ]}
          rows={rows}
        />
      )}
    </div>

    <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Add user">
      <form onSubmit={createUser} className="space-y-4">
        <p className="text-sm text-slate-400">
          Creates a staff account. Students sign up themselves — public registration is student-only.
        </p>
        <div>
          <label className="cf-label" htmlFor="nu-name">Full name</label>
          <input id="nu-name" className="cf-input" value={form.name} onChange={set('name')} required />
        </div>
        <div>
          <label className="cf-label" htmlFor="nu-email">Email</label>
          <input id="nu-email" type="email" className="cf-input" value={form.email} onChange={set('email')} required />
        </div>
        <div>
          <label className="cf-label" htmlFor="nu-password">Temporary password</label>
          <input id="nu-password" type="password" className="cf-input" value={form.password} onChange={set('password')} minLength={8} required />
          <p className="cf-hint">At least 8 characters. Share it with them once — they can change it after signing in.</p>
        </div>
        <div>
          <label className="cf-label" htmlFor="nu-role">Role</label>
          <select id="nu-role" className="cf-input" value={form.role} onChange={set('role')}>
            <option value="recruiter">Recruiter</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="cf-btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
          <button type="submit" className="cf-btn-primary" disabled={busy}>Create account</button>
        </div>
      </form>
    </Modal>

    <ConfirmDialog
      isOpen={toggleUser != null}
      onClose={() => setToggleUser(null)}
      onConfirm={confirmToggle}
      title={toggleUser?.is_active === false || toggleUser?.is_active === 0 ? 'Reactivate this account?' : 'Deactivate this account?'}
      message={toggleUser?.is_active === false || toggleUser?.is_active === 0
        ? `${toggleUser?.name} will be able to sign in again.`
        : `${toggleUser?.name} will not be able to sign in until reactivated. Their data stays as it is.`}
      confirmText={toggleUser?.is_active === false || toggleUser?.is_active === 0 ? 'Reactivate' : 'Deactivate'}
      loading={busy}
    />

    <Modal isOpen={tempPassword != null} onClose={() => setTempPassword(null)} title="Temporary password">
      <p className="text-sm text-slate-300">
        New temporary password for <strong>{tempPassword?.name}</strong>. Share it once — it will not be shown again.
      </p>
      <p className="font-mono-tight text-lg text-slate-100 bg-[#151B30] rounded-xl px-4 py-3 mt-3 break-all">
        {tempPassword?.password}
      </p>
      <div className="flex justify-end mt-4">
        <button type="button" className="cf-btn-primary" onClick={() => setTempPassword(null)}>Done</button>
      </div>
    </Modal>
    </div>
  );
}
