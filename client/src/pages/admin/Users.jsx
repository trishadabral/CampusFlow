// M1 — Users: admin directory of accounts (privilege rings: admin > recruiter > student).

import React, { useEffect, useState } from 'react';
import { users as usersApi, errMsg } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import DataTable from '../../components/DataTable.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';

const ROLE_PILL = { admin: 'danger', recruiter: 'info', student: 'success' };

export default function Users() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await usersApi.list();
        setRows(data ?? []);
      } catch (err) {
        if (err?.response?.status === 404) {
          // Backend may not expose /users in Phase 1 — fail gracefully, no crash.
          setUnavailable(true);
        } else {
          toast(errMsg(err, 'Could not load users.'), 'error');
        }
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div className="text-sm text-slate-500 py-10 text-center">Loading users…</div>;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="font-semibold text-slate-900">Users</h2>
        <p className="text-xs text-slate-500 mt-0.5">Role-based access: admins see everything, recruiters manage their drives, students see their own data.</p>
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
            { key: 'name', label: 'Name', render: (u) => <span className="font-medium text-slate-900">{u.name}</span> },
            { key: 'email', label: 'Email', render: (u) => <span className="text-slate-600">{u.email}</span> },
            { key: 'role', label: 'Role', render: (u) => <Badge variant={ROLE_PILL[u.role] ?? 'neutral'}>{u.role}</Badge> },
            { key: 'branch', label: 'Branch', render: (u) => u.branch ?? '—' },
            { key: 'cgpa', label: 'CGPA', render: (u) => u.cgpa ?? '—' },
          ]}
          rows={rows}
        />
      )}
    </div>
  );
}
